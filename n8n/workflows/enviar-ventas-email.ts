import { workflow, node, trigger } from '@n8n/workflow-sdk';

// Datos precalculados en tiempo de diseño (fuente: ps n8n-mcp)
const totalVentas = 3;
const ingresosTotales = 708.90;
const asunto = '📊 Reporte de Ventas Mercato - 3 ventas - €708.90';

const htmlMensaje = `<!DOCTYPE html>
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
    <strong>Total de ventas:</strong> 3<br>
    <strong>Ingresos totales:</strong> €708.90<br>
    <strong>Fecha del reporte:</strong> 25 de octubre de 2026
  </div>

    <h2>Venta: V-MVOF0WM9-59756E</h2>
    <p><strong>Cliente:</strong> Roberto (roberto@example.com)</p>
    <p><strong>Fecha:</strong> 25 de octubre de 2026, 22:44</p>
    <p><strong>Estado:</strong> <span style="color: #27ae60;">Completada</span></p>

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
          <tr>
            <td>Mochila urbana Canvas</td>
            <td>ACC-CA-003</td>
            <td>3</td>
            <td>€79.00</td>
            <td>€237.00</td>
          </tr>
          <tr>
            <td>mouse</td>
            <td>raton</td>
            <td>2</td>
            <td>€0.30</td>
            <td>€0.60</td>
          </tr>
        <tr class="total">
          <td colspan="4" style="text-align: right;">Total:</td>
          <td>€237.60</td>
        </tr>
      </tbody>
    </table>

    <h2>Venta: V-MVLS6MML-DD831D</h2>
    <p><strong>Cliente:</strong> María García (maria@example.com)</p>
    <p><strong>Fecha:</strong> 24 de octubre de 2026, 02:29</p>
    <p><strong>Estado:</strong> <span style="color: #27ae60;">Completada</span></p>

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
          <tr>
            <td>Lámpara de escritorio Noma</td>
            <td>HOG-NO-002</td>
            <td>1</td>
            <td>€64.50</td>
            <td>€64.50</td>
          </tr>
          <tr>
            <td>Organizador de viaje Fold</td>
            <td>ACC-FO-006</td>
            <td>2</td>
            <td>€24.90</td>
            <td>€49.80</td>
          </tr>
        <tr class="total">
          <td colspan="4" style="text-align: right;">Total:</td>
          <td>€114.30</td>
        </tr>
      </tbody>
    </table>

    <h2>Venta: V-MVLRLMCF-F7E03E</h2>
    <p><strong>Cliente:</strong> Jhon Doe (doe@example.com)</p>
    <p><strong>Fecha:</strong> 24 de octubre de 2026, 02:13</p>
    <p><strong>Estado:</strong> <span style="color: #27ae60;">Completada</span></p>

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
          <tr>
            <td>Teclado mecánico Forma</td>
            <td>TEC-FO-005</td>
            <td>3</td>
            <td>€119.00</td>
            <td>€357.00</td>
          </tr>
        <tr class="total">
          <td colspan="4" style="text-align: right;">Total:</td>
          <td>€357.00</td>
        </tr>
      </tbody>
    </table>

  <div class="footer">
    <p>Este reporte fue generado automáticamente desde el sistema Mercato Gestor de Ventas.</p>
    <p>Enviado mediante n8n workflow</p>
  </div>
</body>
</html>`;

const iniciarEnvio = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Iniciar Envío' }
});

const enviarCorreo = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Enviar Ventas por Gmail',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: 'pedroalejandrorosaperez@gmail.com',
      subject: asunto,
      emailType: 'html',
      message: htmlMensaje,
      options: {
        appendAttribution: false,
        senderName: 'Mercato Gestor de Ventas'
      }
    }
  }
});

export default workflow('enviar-ventas-email', 'Envía reporte de ventas de Mercato por Gmail a pedroalejandrorosaperez@gmail.com')
  .add(iniciarEnvio)
  .to(enviarCorreo);
