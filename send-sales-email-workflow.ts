import { workflow, node, trigger } from '@n8n/workflow-sdk';

// Sales data from the database
const salesData = [
  {
    id: '57afc5e2-a453-4990-b6b6-9bf877c3aea3',
    number: 'V-MVOF0WM9-59756E',
    customerName: 'Roberto',
    customerEmail: 'roberto@example.com',
    totalCents: 23760,
    status: 'completed',
    createdAt: '2026-10-25T22:44:47.254464Z',
    items: [
      { productName: 'Mochila urbana Canvas', sku: 'ACC-CA-003', quantity: 3, unitPriceCents: 7900 },
      { productName: 'mouse', sku: 'raton', quantity: 2, unitPriceCents: 30 },
    ],
  },
  {
    id: 'e580c48d-0c0a-42ca-b02f-ee65724cdf95',
    number: 'V-MVLS6MML-DD831D',
    customerName: 'María García',
    customerEmail: 'maria@example.com',
    totalCents: 11430,
    status: 'completed',
    createdAt: '2026-10-24T02:29:50.727543Z',
    items: [
      { productName: 'Lámpara de escritorio Noma', sku: 'HOG-NO-002', quantity: 1, unitPriceCents: 6450 },
      { productName: 'Organizador de viaje Fold', sku: 'ACC-FO-006', quantity: 2, unitPriceCents: 2490 },
    ],
  },
  {
    id: '5a342253-2fc1-474a-b646-f968bc1537d5',
    number: 'V-MVLRLMCF-F7E03E',
    customerName: 'Jhon Doe',
    customerEmail: 'doe@example.com',
    totalCents: 35700,
    status: 'completed',
    createdAt: '2026-10-24T02:13:30.576196Z',
    items: [
      { productName: 'Teclado mecánico Forma', sku: 'TEC-FO-005', quantity: 3, unitPriceCents: 11900 },
    ],
  },
];

// Build email content
const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #3498db; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .total { font-weight: bold; font-size: 1.1em; color: #27ae60; }
    .summary { background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #7f8c8d; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>📊 Reporte de Ventas - Mercato</h1>
  
  <div class="summary">
    <strong>Total de ventas:</strong> ${salesData.length}<br>
    <strong>Ingresos totales:</strong> €${(salesData.reduce((sum, s) => sum + s.totalCents, 0) / 100).toFixed(2)}<br>
    <strong>Fecha del reporte:</strong> ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>

  ${salesData.map(sale => `
    <h2>Venta: ${sale.number}</h2>
    <p><strong>Cliente:</strong> ${sale.customerName} (${sale.customerEmail})</p>
    <p><strong>Fecha:</strong> ${new Date(sale.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    <p><strong>Estado:</strong> <span style="color: ${sale.status === 'completed' ? '#27ae60' : '#e74c3c'}; text-transform: capitalize;">${sale.status}</span></p>
    
    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th>SKU</th>
          <th>Cantidad</th>
          <th>Precio Unit.</th>
          <th>Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${sale.items.map(item => `
          <tr>
            <td>${item.productName}</td>
            <td>${item.sku}</td>
            <td>${item.quantity}</td>
            <td>€${(item.unitPriceCents / 100).toFixed(2)}</td>
            <td>€${((item.quantity * item.unitPriceCents) / 100).toFixed(2)}</td>
          </tr>
        `).join('')}
        <tr class="total">
          <td colspan="4" style="text-align: right;">Total:</td>
          <td>€${(sale.totalCents / 100).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  `).join('')}

  <div class="footer">
    <p>Este reporte fue generado automáticamente desde el sistema Mercato Gestor de Ventas.</p>
    <p>Enviado mediante n8n workflow el ${new Date().toLocaleString('es-ES')}</p>
  </div>
</body>
</html>
`;

const emailText = `
Reporte de Ventas - Mercato
===========================

Total de ventas: ${salesData.length}
Ingresos totales: €${(salesData.reduce((sum, s) => sum + s.totalCents, 0) / 100).toFixed(2)}
Fecha del reporte: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}

${salesData.map(sale => `
Venta: ${sale.number}
Cliente: ${sale.customerName} (${sale.customerEmail})
Fecha: ${new Date(sale.createdAt).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
Estado: ${sale.status}

Productos:
${sale.items.map(item => `  - ${item.productName} (${item.sku}) x${item.quantity} @ €${(item.unitPriceCents / 100).toFixed(2)} = €${((item.quantity * item.unitPriceCents) / 100).toFixed(2)}`).join('\n')}
Total: €${(sale.totalCents / 100).toFixed(2)}
`).join('\n\n')}

---
Este reporte fue generado automáticamente desde el sistema Mercato Gestor de Ventas.
Enviado mediante n8n workflow el ${new Date().toLocaleString('es-ES')}
`;

const manualTrigger = trigger('Manual Trigger', {
  name: 'Iniciar Envío',
});

const sendEmail = node({
  name: 'Enviar Email con Ventas',
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  resource: 'message',
  operation: 'send',
  credentials: { gmailOAuth2: 'Gmail OAuth2' },
  parameters: {
    sendTo: 'pedroalejandrorosaperez@gmail.com',
    subject: `📊 Reporte de Ventas Mercato - ${salesData.length} ventas - €${(salesData.reduce((sum, s) => sum + s.totalCents, 0) / 100).toFixed(2)}`,
    emailType: 'html',
    message: emailHtml,
    options: {
      appendAttribution: false,
      senderName: 'Mercato Gestor de Ventas',
    },
  },
});

manualTrigger.connect(sendEmail);

export default workflow('send-sales-email', 'Envía reporte de ventas por email a pedroalejandrorosaperez@gmail.com')
  .add(manualTrigger)
  .add(sendEmail);