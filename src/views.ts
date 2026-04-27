// SPA shell - all UI is rendered client-side from /static/app.js
export function renderApp(): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="ورشة شويخ - نظام إدارة تصليح المحركات">
<meta name="theme-color" content="#0f172a">
<title>ورشة شويخ - نظام إدارة المحركات</title>
<link rel="icon" type="image/svg+xml" href="/static/logo.svg">
<link rel="apple-touch-icon" href="/static/logo.svg">
<link rel="manifest" href="/static/manifest.webmanifest">
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="stylesheet" href="/static/styles.css">
</head>
<body class="text-gray-100">
  <div id="root"></div>
  <div id="toastContainer" class="fixed bottom-6 left-6 z-[100] space-y-3"></div>
  <div id="modalContainer"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script src="/static/app.js"></script>
</body>
</html>`
}
