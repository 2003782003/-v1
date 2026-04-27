export type Bindings = {
  DB: D1Database
}

export type User = {
  id: number
  username: string
  role: 'admin' | 'technician' | 'customer'
  full_name: string
  phone: string | null
  notify_frequency?: string
}

export type Engine = {
  id: number
  customer_id: number
  technician_id: number | null
  engine_name: string
  engine_type: string
  power: string | null
  fault: string | null
  fault_images: string | null
  missing_parts: string | null
  parts_list: string | null
  estimated_price: number
  final_price: number
  paid_amount: number
  payment_status: string
  status: 'unrepaired' | 'in_progress' | 'ready' | 'delivered'
  entry_date: string
  expected_delivery: string | null
  delivered_at: string | null
}
