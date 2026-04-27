import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { setCookie, deleteCookie } from 'hono/cookie'
import type { Bindings } from './types'
import { sha256, makeToken, getCurrentUser, requireRole } from './auth'
import { renderApp } from './views'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors({ origin: '*', credentials: true }))

// ============ AUTH ============

app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json<{ username: string; password: string }>()
  if (!username || !password) return c.json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' }, 400)
  const hash = await sha256(password)
  const { results } = await c.env.DB.prepare(
    `SELECT id, username, role, full_name, phone, notify_frequency FROM users
     WHERE username = ? AND password_hash = ?`
  ).bind(username, hash).all()
  if (!results || results.length === 0) {
    return c.json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' }, 401)
  }
  const user = results[0] as any
  const token = makeToken()
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, user.id, expires).run()
  setCookie(c, 'session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 3600
  })
  return c.json({ user, token })
})

app.post('/api/auth/register', async (c) => {
  const { username, password, full_name, phone } = await c.req.json<any>()
  if (!username || !password || !full_name || !phone) {
    return c.json({ error: 'جميع الحقول مطلوبة' }, 400)
  }
  // Customer self-register only
  const hash = await sha256(password)
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO users (username, password_hash, role, full_name, phone)
       VALUES (?, ?, 'customer', ?, ?)`
    ).bind(username, hash, full_name, phone).run()
    const id = res.meta.last_row_id
    const token = makeToken()
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    await c.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
    ).bind(token, id, expires).run()
    setCookie(c, 'session', token, { path: '/', httpOnly: true, sameSite: 'Lax', maxAge: 7 * 24 * 3600 })
    return c.json({ user: { id, username, role: 'customer', full_name, phone }, token })
  } catch (e: any) {
    return c.json({ error: 'اسم المستخدم مستخدم بالفعل' }, 400)
  }
})

app.post('/api/auth/logout', async (c) => {
  const token = c.req.header('Cookie')?.match(/session=([^;]+)/)?.[1]
  if (token) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run()
  }
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

app.get('/api/auth/me', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ user: null })
  return c.json({ user })
})

// ============ USERS (Admin) ============

app.get('/api/users', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const role = c.req.query('role')
  const q = c.req.query('q')
  let sql = `SELECT id, username, role, full_name, phone, notify_frequency, created_at FROM users WHERE 1=1`
  const binds: any[] = []
  if (role) { sql += ' AND role = ?'; binds.push(role) }
  if (q) { sql += ' AND (full_name LIKE ? OR phone LIKE ? OR username LIKE ?)'; binds.push(`%${q}%`, `%${q}%`, `%${q}%`) }
  sql += ' ORDER BY created_at DESC'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ users: results || [] })
})

app.post('/api/users', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const { username, password, role, full_name, phone, notify_frequency } = await c.req.json<any>()
  if (!username || !password || !role || !full_name) {
    return c.json({ error: 'الحقول المطلوبة ناقصة' }, 400)
  }
  const hash = await sha256(password)
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO users (username, password_hash, role, full_name, phone, notify_frequency)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, 'monthly'))`
    ).bind(username, hash, role, full_name, phone || null, notify_frequency || null).run()
    return c.json({ id: res.meta.last_row_id })
  } catch {
    return c.json({ error: 'اسم المستخدم موجود مسبقاً' }, 400)
  }
})

app.put('/api/users/:id', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  const { full_name, phone, notify_frequency, password, role } = await c.req.json<any>()
  const sets: string[] = []
  const binds: any[] = []
  if (full_name) { sets.push('full_name = ?'); binds.push(full_name) }
  if (phone !== undefined) { sets.push('phone = ?'); binds.push(phone) }
  if (notify_frequency) { sets.push('notify_frequency = ?'); binds.push(notify_frequency) }
  if (role) { sets.push('role = ?'); binds.push(role) }
  if (password) { sets.push('password_hash = ?'); binds.push(await sha256(password)) }
  sets.push("updated_at = datetime('now')")
  if (sets.length === 1) return c.json({ error: 'لا يوجد تحديثات' }, 400)
  binds.push(id)
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  return c.json({ ok: true })
})

app.delete('/api/users/:id', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  if (id === user.id) return c.json({ error: 'لا يمكن حذف نفسك' }, 400)
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ============ ENGINES ============

app.get('/api/engines', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  const status = c.req.query('status')
  let sql = `SELECT e.*, u.full_name AS customer_name, u.phone AS customer_phone,
             t.full_name AS technician_name
             FROM engines e
             JOIN users u ON u.id = e.customer_id
             LEFT JOIN users t ON t.id = e.technician_id
             WHERE 1=1`
  const binds: any[] = []
  if (user.role === 'customer') { sql += ' AND e.customer_id = ?'; binds.push(user.id) }
  if (status) { sql += ' AND e.status = ?'; binds.push(status) }
  sql += ' ORDER BY e.created_at DESC'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ engines: results || [] })
})

app.get('/api/engines/:id', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  const id = Number(c.req.param('id'))
  const { results } = await c.env.DB.prepare(
    `SELECT e.*, u.full_name AS customer_name, u.phone AS customer_phone, u.username AS customer_username,
     t.full_name AS technician_name
     FROM engines e JOIN users u ON u.id = e.customer_id
     LEFT JOIN users t ON t.id = e.technician_id WHERE e.id = ?`
  ).bind(id).all<any>()
  if (!results || !results.length) return c.json({ error: 'غير موجود' }, 404)
  const eng = results[0]
  if (user.role === 'customer' && eng.customer_id !== user.id) {
    return c.json({ error: 'غير مصرح' }, 403)
  }
  return c.json({ engine: eng })
})

app.post('/api/engines', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const body = await c.req.json<any>()
  const {
    customer_id, engine_name, engine_type, power,
    fault, fault_images, missing_parts, parts_list,
    estimated_price, entry_date, expected_delivery
  } = body
  if (!customer_id || !engine_name || !engine_type) {
    return c.json({ error: 'حقول إلزامية ناقصة' }, 400)
  }
  const res = await c.env.DB.prepare(
    `INSERT INTO engines (customer_id, technician_id, engine_name, engine_type, power,
      fault, fault_images, missing_parts, parts_list, estimated_price,
      entry_date, expected_delivery)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_DATE), ?)`
  ).bind(
    customer_id, user.role === 'technician' ? user.id : null,
    engine_name, engine_type, power || null,
    fault || null, fault_images ? JSON.stringify(fault_images) : null,
    missing_parts || null, parts_list ? JSON.stringify(parts_list) : null,
    estimated_price || 0, entry_date || null, expected_delivery || null
  ).run()
  const engineId = res.meta.last_row_id
  // Create notification for customer
  await c.env.DB.prepare(
    `INSERT INTO notifications (user_id, title, body, type)
     VALUES (?, ?, ?, 'status')`
  ).bind(customer_id, 'تم تسجيل محرك جديد', `تم تسجيل المحرك "${engine_name}" في الورشة.`).run()
  return c.json({ id: engineId })
})

app.put('/api/engines/:id', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  const body = await c.req.json<any>()
  const fields = [
    'engine_name', 'engine_type', 'power', 'fault',
    'missing_parts', 'estimated_price', 'final_price', 'paid_amount',
    'payment_status', 'status', 'expected_delivery'
  ]
  const sets: string[] = []
  const binds: any[] = []
  for (const f of fields) {
    if (body[f] !== undefined) { sets.push(`${f} = ?`); binds.push(body[f]) }
  }
  if (body.fault_images) { sets.push('fault_images = ?'); binds.push(JSON.stringify(body.fault_images)) }
  if (body.parts_list) { sets.push('parts_list = ?'); binds.push(JSON.stringify(body.parts_list)) }
  if (body.status === 'delivered') { sets.push("delivered_at = datetime('now')") }
  sets.push("updated_at = datetime('now')")
  if (sets.length === 1) return c.json({ error: 'لا يوجد تحديثات' }, 400)
  binds.push(id)
  await c.env.DB.prepare(`UPDATE engines SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run()
  // Notify customer
  if (body.status) {
    const { results } = await c.env.DB.prepare('SELECT customer_id, engine_name FROM engines WHERE id = ?').bind(id).all<any>()
    if (results && results[0]) {
      const statusMap: any = {
        in_progress: 'قيد التصليح',
        ready: 'جاهز للاستلام',
        delivered: 'تم التسليم',
        unrepaired: 'غير مصلح بعد'
      }
      await c.env.DB.prepare(
        `INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, 'status')`
      ).bind(results[0].customer_id, 'تحديث حالة محرك', `المحرك "${results[0].engine_name}" — الحالة: ${statusMap[body.status] || body.status}`).run()
    }
  }
  return c.json({ ok: true })
})

app.delete('/api/engines/:id', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM engines WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ============ MESSAGES ============

app.get('/api/messages', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  const withUser = c.req.query('with')
  let sql: string
  let binds: any[]
  if (withUser) {
    sql = `SELECT m.*, u1.full_name AS from_name, u2.full_name AS to_name
           FROM messages m JOIN users u1 ON u1.id = m.from_user_id JOIN users u2 ON u2.id = m.to_user_id
           WHERE (m.from_user_id = ? AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = ?)
           ORDER BY m.created_at ASC`
    binds = [user.id, Number(withUser), Number(withUser), user.id]
    // mark as read
    await c.env.DB.prepare('UPDATE messages SET is_read = 1 WHERE to_user_id = ? AND from_user_id = ?')
      .bind(user.id, Number(withUser)).run()
  } else {
    // Get all conversations
    sql = `SELECT m.*, u1.full_name AS from_name, u2.full_name AS to_name
           FROM messages m JOIN users u1 ON u1.id = m.from_user_id JOIN users u2 ON u2.id = m.to_user_id
           WHERE m.from_user_id = ? OR m.to_user_id = ?
           ORDER BY m.created_at DESC`
    binds = [user.id, user.id]
  }
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ messages: results || [] })
})

app.get('/api/messages/conversations', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  // For customer: list all admin+technician. For staff: list all customers they messaged or ever.
  let sql: string
  let binds: any[]
  if (user.role === 'customer') {
    sql = `SELECT u.id, u.full_name, u.role,
             (SELECT body FROM messages m WHERE (m.from_user_id = u.id AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = u.id) ORDER BY m.created_at DESC LIMIT 1) AS last_message,
             (SELECT COUNT(*) FROM messages m WHERE m.from_user_id = u.id AND m.to_user_id = ? AND m.is_read = 0) AS unread
           FROM users u WHERE u.role IN ('admin','technician') ORDER BY u.role DESC`
    binds = [user.id, user.id, user.id]
  } else {
    sql = `SELECT u.id, u.full_name, u.role,
             (SELECT body FROM messages m WHERE (m.from_user_id = u.id AND m.to_user_id = ?) OR (m.from_user_id = ? AND m.to_user_id = u.id) ORDER BY m.created_at DESC LIMIT 1) AS last_message,
             (SELECT COUNT(*) FROM messages m WHERE m.from_user_id = u.id AND m.to_user_id = ? AND m.is_read = 0) AS unread
           FROM users u WHERE u.role = 'customer' ORDER BY u.full_name`
    binds = [user.id, user.id, user.id]
  }
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ conversations: results || [] })
})

app.post('/api/messages', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  const { to_user_id, body, image_url, engine_id } = await c.req.json<any>()
  if (!to_user_id || (!body && !image_url)) return c.json({ error: 'بيانات ناقصة' }, 400)
  const res = await c.env.DB.prepare(
    `INSERT INTO messages (from_user_id, to_user_id, engine_id, body, image_url)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(user.id, to_user_id, engine_id || null, body || null, image_url || null).run()
  // Create notification
  await c.env.DB.prepare(
    `INSERT INTO notifications (user_id, title, body, type) VALUES (?, ?, ?, 'message')`
  ).bind(to_user_id, `رسالة جديدة من ${user.full_name}`, (body || '[صورة]').slice(0, 100)).run()
  return c.json({ id: res.meta.last_row_id })
})

app.get('/api/messages/unread-count', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ count: 0 })
  const { results } = await c.env.DB.prepare(
    'SELECT COUNT(*) AS c FROM messages WHERE to_user_id = ? AND is_read = 0'
  ).bind(user.id).all<any>()
  return c.json({ count: results?.[0]?.c || 0 })
})

// ============ NOTIFICATIONS ============

app.get('/api/notifications', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ notifications: [] })
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all()
  return c.json({ notifications: results || [] })
})

app.post('/api/notifications/read', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.id).run()
  return c.json({ ok: true })
})

// ============ DEBTS / PAYMENTS ============

app.get('/api/debts', async (c) => {
  const user = await getCurrentUser(c)
  if (!user) return c.json({ error: 'غير مصادق' }, 401)
  let sql = `SELECT e.id, e.engine_name, e.engine_type, e.final_price, e.paid_amount, e.payment_status,
             (e.final_price - e.paid_amount) AS remaining,
             u.full_name AS customer_name, u.phone AS customer_phone, u.id AS customer_id
             FROM engines e JOIN users u ON u.id = e.customer_id
             WHERE e.final_price > e.paid_amount`
  const binds: any[] = []
  if (user.role === 'customer') { sql += ' AND e.customer_id = ?'; binds.push(user.id) }
  sql += ' ORDER BY e.created_at DESC'
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ debts: results || [] })
})

app.post('/api/debts/pay', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const { engine_id, amount, payment_status } = await c.req.json<any>()
  if (!engine_id || amount === undefined) return c.json({ error: 'بيانات ناقصة' }, 400)
  await c.env.DB.prepare(
    `UPDATE engines SET paid_amount = paid_amount + ?, payment_status = COALESCE(?, payment_status),
     updated_at = datetime('now') WHERE id = ?`
  ).bind(amount, payment_status || null, engine_id).run()
  return c.json({ ok: true })
})

// Send debt reminders (admin/technician only)
app.post('/api/debts/remind', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const { customer_id } = await c.req.json<any>()
  if (!customer_id) return c.json({ error: 'معرّف الزبون مطلوب' }, 400)
  const { results } = await c.env.DB.prepare(
    `SELECT SUM(final_price - paid_amount) AS debt FROM engines WHERE customer_id = ? AND final_price > paid_amount`
  ).bind(customer_id).all<any>()
  const amount = results?.[0]?.debt || 0
  await c.env.DB.prepare(
    `INSERT INTO notifications (user_id, title, body, type)
     VALUES (?, 'تذكير بالدين المستحق', ?, 'debt')`
  ).bind(customer_id, `لديك دين مستحق بمبلغ ${amount} دج. يُرجى التواصل مع الورشة لتسديده.`).run()
  return c.json({ ok: true, amount })
})

// ============ SPARE PARTS ============

app.get('/api/spare-parts', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const { results } = await c.env.DB.prepare('SELECT * FROM spare_parts ORDER BY name').all()
  return c.json({ parts: results || [] })
})

app.post('/api/spare-parts', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const { name, quantity, price, notes } = await c.req.json<any>()
  if (!name) return c.json({ error: 'الاسم مطلوب' }, 400)
  const res = await c.env.DB.prepare(
    'INSERT INTO spare_parts (name, quantity, price, notes) VALUES (?, ?, ?, ?)'
  ).bind(name, quantity || 0, price || 0, notes || null).run()
  return c.json({ id: res.meta.last_row_id })
})

app.put('/api/spare-parts/:id', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  const { name, quantity, price, notes } = await c.req.json<any>()
  await c.env.DB.prepare(
    'UPDATE spare_parts SET name = COALESCE(?, name), quantity = COALESCE(?, quantity), price = COALESCE(?, price), notes = COALESCE(?, notes) WHERE id = ?'
  ).bind(name || null, quantity ?? null, price ?? null, notes || null, id).run()
  return c.json({ ok: true })
})

app.delete('/api/spare-parts/:id', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM spare_parts WHERE id = ?').bind(id).run()
  return c.json({ ok: true })
})

// ============ REPORTS / STATS ============

app.get('/api/stats', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const queries = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS c FROM engines').all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM engines WHERE status = 'unrepaired'").all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM engines WHERE status = 'in_progress'").all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM engines WHERE status = 'ready'").all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM engines WHERE status = 'delivered'").all<any>(),
    c.env.DB.prepare("SELECT COALESCE(SUM(final_price - paid_amount), 0) AS total FROM engines WHERE final_price > paid_amount").all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'customer'").all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'technician'").all<any>(),
  ])
  return c.json({
    total_engines: queries[0].results?.[0]?.c || 0,
    unrepaired: queries[1].results?.[0]?.c || 0,
    in_progress: queries[2].results?.[0]?.c || 0,
    ready: queries[3].results?.[0]?.c || 0,
    delivered: queries[4].results?.[0]?.c || 0,
    total_debt: queries[5].results?.[0]?.total || 0,
    customers: queries[6].results?.[0]?.c || 0,
    technicians: queries[7].results?.[0]?.c || 0
  })
})

app.get('/api/reports', async (c) => {
  const user = await requireRole(c, ['admin', 'technician'])
  if (user instanceof Response) return user
  const { results: monthly } = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS engines,
     SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
     COALESCE(SUM(final_price), 0) AS revenue
     FROM engines GROUP BY month ORDER BY month DESC LIMIT 12`
  ).all()
  const { results: recent } = await c.env.DB.prepare(
    `SELECT e.*, u.full_name AS customer_name FROM engines e JOIN users u ON u.id = e.customer_id ORDER BY e.created_at DESC LIMIT 20`
  ).all()
  return c.json({ monthly: monthly || [], recent: recent || [] })
})

// ============ BACKUP ============

app.get('/api/backup', async (c) => {
  const user = await requireRole(c, ['admin'])
  if (user instanceof Response) return user
  const tables = ['users', 'engines', 'messages', 'notifications', 'spare_parts', 'repair_reports']
  const backup: any = { created_at: new Date().toISOString() }
  for (const t of tables) {
    const { results } = await c.env.DB.prepare(`SELECT * FROM ${t}`).all()
    backup[t] = results || []
  }
  const json = JSON.stringify(backup, null, 2)
  await c.env.DB.prepare('INSERT INTO backups (file_name, size) VALUES (?, ?)')
    .bind(`backup_${Date.now()}.json`, json.length).run()
  return new Response(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="backup_${new Date().toISOString().slice(0,10)}.json"`
    }
  })
})

// ============ HTML PAGES ============
app.get('*', (c) => c.html(renderApp()))

export default app
