import type { OpenAPIV3 } from 'openapi-types';

const schema = (name: string): OpenAPIV3.ReferenceObject => ({ $ref: `#/components/schemas/${name}` });
const jsonResponse = (description: string, name: string): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: schema(name) } },
});
const errorResponse = (description: string) => jsonResponse(description, 'Error');
const jsonBody = (name: string): OpenAPIV3.RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema: schema(name) } },
});
const idParameter: OpenAPIV3.ParameterObject = {
  in: 'path', name: 'id', required: true, description: 'Identificador UUID del recurso',
  schema: { type: 'string', format: 'uuid' },
};

export const openApiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Mercato · API de gestión de ventas',
    version: '1.0.0',
    description: 'API REST del panel de ventas e inventario. Los importes se expresan en **céntimos de euro**. Para probar rutas protegidas desde Swagger UI, ejecuta primero `POST /auth/login`: el navegador conservará la cookie HTTP-only y la enviará automáticamente. No es necesario (ni posible) copiar la cookie en «Authorize». Las escrituras desde un navegador solo aceptan el origen del panel (`WEB_ORIGIN`) o el mismo origen de la API (Swagger UI).',
  },
  servers: [{ url: '/', description: 'Mismo origen que la documentación Swagger' }],
  tags: [
    { name: 'Sistema', description: 'Estado del servicio' },
    { name: 'Autenticación', description: 'Inicio y cierre de sesión con cookie HTTP-only' },
    { name: 'Productos', description: 'Catálogo y ajustes de existencias' },
    { name: 'Almacén', description: 'Historial de movimientos de stock' },
    { name: 'Ventas', description: 'Registro y cancelación de ventas' },
    { name: 'Dashboard', description: 'Indicadores del negocio' },
  ],
  security: [{ sessionCookie: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Sistema'], summary: 'Comprobar estado de la API', security: [],
        responses: { '200': jsonResponse('Servicio disponible', 'HealthResponse') },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Autenticación'], summary: 'Iniciar sesión', security: [], requestBody: jsonBody('LoginInput'),
        description: 'Devuelve el usuario y establece la cookie `gestor_session` (HTTP-only, SameSite=Lax, 7 días). En producción la cookie se marca Secure.',
        responses: { '200': jsonResponse('Sesión iniciada; cookie de sesión en Set-Cookie', 'UserResponse'), '400': errorResponse('Datos no válidos'), '401': errorResponse('Credenciales incorrectas'), '403': errorResponse('Origen no permitido'), '500': errorResponse('Error interno') },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Autenticación'], summary: 'Cerrar sesión', security: [],
        description: 'Borra la cookie del navegador. No requiere una sesión activa.',
        responses: { '200': jsonResponse('Cookie borrada', 'OkResponse'), '403': errorResponse('Origen no permitido') },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Autenticación'], summary: 'Consultar el usuario actual',
        responses: { '200': jsonResponse('Usuario autenticado', 'UserResponse'), '401': errorResponse('Sesión ausente o caducada') },
      },
    },
    '/products': {
      get: {
        tags: ['Productos'], summary: 'Listar productos', description: 'Devuelve hasta 500 productos, ordenados del más reciente al más antiguo.',
        responses: { '200': jsonResponse('Listado de productos', 'ProductsResponse'), '401': errorResponse('Sesión ausente o caducada') },
      },
      post: {
        tags: ['Productos'], summary: 'Crear producto', description: '**Solo administrador.** El stock inicial es 0; utiliza el endpoint de ajuste para añadir existencias.', requestBody: jsonBody('ProductInput'),
        responses: { '201': jsonResponse('Producto creado', 'ProductResponse'), '400': errorResponse('Datos no válidos'), '401': errorResponse('No autenticado'), '403': errorResponse('Requiere administrador u origen no permitido'), '409': errorResponse('SKU duplicado') },
      },
    },
    '/products/{id}': {
      patch: {
        tags: ['Productos'], summary: 'Editar un producto', description: '**Solo administrador.** Se envían únicamente los campos que se deseen cambiar; al menos uno es obligatorio.', parameters: [idParameter], requestBody: jsonBody('ProductUpdate'),
        responses: { '200': jsonResponse('Producto actualizado', 'ProductResponse'), '400': errorResponse('Datos o UUID no válidos'), '401': errorResponse('No autenticado'), '403': errorResponse('Requiere administrador u origen no permitido'), '404': errorResponse('Producto no encontrado'), '409': errorResponse('SKU duplicado') },
      },
    },
    '/products/{id}/stock': {
      post: {
        tags: ['Productos', 'Almacén'], summary: 'Ajustar stock de un producto', description: '**Solo administrador.** `delta` positivo añade unidades; negativo las retira. No se permite dejar stock negativo. El movimiento y el cambio de existencias se guardan en una transacción.', parameters: [idParameter], requestBody: jsonBody('InventoryInput'),
        responses: { '200': jsonResponse('Stock actualizado', 'ProductResponse'), '400': errorResponse('Datos o UUID no válidos'), '401': errorResponse('No autenticado'), '403': errorResponse('Requiere administrador u origen no permitido'), '404': errorResponse('Producto no encontrado'), '409': errorResponse('Stock insuficiente') },
      },
    },
    '/inventory': {
      get: {
        tags: ['Almacén'], summary: 'Listar movimientos de inventario', description: 'Devuelve hasta 200 movimientos, del más reciente al más antiguo.',
        responses: { '200': jsonResponse('Historial de movimientos', 'MovementsResponse'), '401': errorResponse('Sesión ausente o caducada') },
      },
    },
    '/sales': {
      get: {
        tags: ['Ventas'], summary: 'Listar ventas', description: 'Devuelve hasta 200 ventas recientes, incluidas sus líneas y las canceladas.',
        responses: { '200': jsonResponse('Historial de ventas', 'SalesResponse'), '401': errorResponse('Sesión ausente o caducada') },
      },
      post: {
        tags: ['Ventas'], summary: 'Registrar venta', description: 'Disponible para administrador y operador. Los IDs de producto no se pueden repetir. Se toma el precio actual de cada producto, se bloquean las filas y se descuenta stock dentro de una única transacción. El stock y el estado del producto se comprueban antes de crear la venta.', requestBody: jsonBody('SaleInput'),
        responses: { '201': jsonResponse('Venta registrada', 'SaleCreatedResponse'), '400': errorResponse('Datos no válidos o importe fuera de rango'), '401': errorResponse('No autenticado'), '403': errorResponse('Origen no permitido'), '404': errorResponse('Producto no encontrado'), '409': errorResponse('Producto inactivo o stock insuficiente') },
      },
    },
    '/sales/{id}/cancel': {
      post: {
        tags: ['Ventas'], summary: 'Cancelar venta y reponer stock', description: '**Solo administrador.** Devuelve las unidades vendidas al almacén y registra movimientos inversos en una transacción. Una venta ya cancelada no se puede cancelar de nuevo.', parameters: [idParameter],
        responses: { '200': jsonResponse('Venta cancelada', 'SaleResponse'), '400': errorResponse('UUID no válido'), '401': errorResponse('No autenticado'), '403': errorResponse('Requiere administrador u origen no permitido'), '404': errorResponse('Venta no encontrada'), '409': errorResponse('Venta ya cancelada') },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Dashboard'], summary: 'Consultar indicadores', description: 'Ingresos y ventas de los últimos 30 días, variación frente al periodo anterior, ventas de 7 días, productos más vendidos, últimos pedidos y alertas de stock.',
        responses: { '200': jsonResponse('Resumen del negocio', 'Dashboard'), '401': errorResponse('Sesión ausente o caducada') },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: 'gestor_session', description: 'Se genera en POST /auth/login. El navegador la envía automáticamente; no puede leerse desde JavaScript por ser HTTP-only.' },
    },
    schemas: {
      Error: { type: 'object', required: ['error'], properties: { error: { type: 'string', example: 'Stock insuficiente' } } },
      HealthResponse: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } },
      OkResponse: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', example: true } } },
      LoginInput: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email', example: 'admin@tienda.local' }, password: { type: 'string', format: 'password', minLength: 1 } } },
      User: { type: 'object', required: ['id', 'name', 'email', 'role'], properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string', format: 'email' }, role: { type: 'string', enum: ['admin', 'operator'] } } },
      UserResponse: { type: 'object', required: ['user'], properties: { user: schema('User') } },
      ProductInput: { type: 'object', required: ['name', 'sku', 'category', 'priceCents'], properties: {
        name: { type: 'string', minLength: 2, maxLength: 160, example: 'Auriculares Studio' }, sku: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-zA-Z0-9._-]+$', example: 'AUD-001' }, category: { type: 'string', minLength: 2, maxLength: 80, example: 'Audio' }, description: { type: 'string', maxLength: 1000, default: '' }, priceCents: { type: 'integer', minimum: 0, maximum: 100000000, example: 8990 }, minStock: { type: 'integer', minimum: 0, maximum: 1000000, default: 5 }, active: { type: 'boolean', default: true },
      } },
      ProductUpdate: { type: 'object', minProperties: 1, description: 'Cualquier subconjunto no vacío de los campos de ProductInput.', properties: {
        name: { type: 'string', minLength: 2, maxLength: 160 }, sku: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[a-zA-Z0-9._-]+$' }, category: { type: 'string', minLength: 2, maxLength: 80 }, description: { type: 'string', maxLength: 1000 }, priceCents: { type: 'integer', minimum: 0, maximum: 100000000 }, minStock: { type: 'integer', minimum: 0, maximum: 1000000 }, active: { type: 'boolean' },
      } },
      Product: { allOf: [schema('ProductInput'), { type: 'object', required: ['id', 'name', 'sku', 'category', 'description', 'priceCents', 'minStock', 'active', 'stock', 'createdAt', 'updatedAt'], properties: { id: { type: 'string', format: 'uuid' }, stock: { type: 'integer', minimum: 0 }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' } } }] },
      ProductResponse: { type: 'object', required: ['product'], properties: { product: schema('Product') } },
      ProductsResponse: { type: 'object', required: ['products'], properties: { products: { type: 'array', items: schema('Product'), maxItems: 500 } } },
      InventoryInput: { type: 'object', required: ['delta', 'note'], properties: { delta: { type: 'integer', minimum: -1000000, maximum: 1000000, not: { enum: [0] }, example: 10 }, note: { type: 'string', minLength: 3, maxLength: 250, example: 'Reposición de proveedor' } } },
      Movement: { type: 'object', required: ['id', 'productId', 'productName', 'sku', 'delta', 'reason', 'note', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, productId: { type: 'string', format: 'uuid' }, productName: { type: 'string' }, sku: { type: 'string' }, delta: { type: 'integer' }, reason: { type: 'string', enum: ['initial', 'adjustment', 'sale', 'cancellation'] }, note: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } },
      MovementsResponse: { type: 'object', required: ['movements'], properties: { movements: { type: 'array', items: schema('Movement'), maxItems: 200 } } },
      SaleInput: { type: 'object', required: ['customerName', 'items'], properties: { customerName: { type: 'string', minLength: 2, maxLength: 120, example: 'Ana García' }, customerEmail: { type: 'string', format: 'email', maxLength: 200, description: 'Opcional; también acepta cadena vacía', example: 'ana@example.com' }, items: { type: 'array', minItems: 1, maxItems: 100, description: 'Cada productId debe aparecer una sola vez.', items: { type: 'object', required: ['productId', 'quantity'], properties: { productId: { type: 'string', format: 'uuid' }, quantity: { type: 'integer', minimum: 1, maximum: 100000 } } } } } },
      SaleItem: { type: 'object', required: ['productId', 'productName', 'sku', 'quantity', 'unitPriceCents'], properties: { id: { type: 'string', format: 'uuid', description: 'Solo en las ventas consultadas; no se devuelve al crear.' }, saleId: { type: 'string', format: 'uuid', description: 'Solo en las ventas consultadas; no se devuelve al crear.' }, productId: { type: 'string', format: 'uuid' }, productName: { type: 'string' }, sku: { type: 'string' }, quantity: { type: 'integer' }, unitPriceCents: { type: 'integer', description: 'Precio unitario en céntimos al crear la venta' } } },
      Sale: { type: 'object', required: ['id', 'number', 'customerName', 'customerEmail', 'totalCents', 'status', 'createdAt'], properties: { id: { type: 'string', format: 'uuid' }, number: { type: 'string', example: 'V-M8U4V1-BE219A' }, customerName: { type: 'string' }, customerEmail: { type: 'string' }, totalCents: { type: 'integer', description: 'Total en céntimos de euro' }, status: { type: 'string', enum: ['completed', 'cancelled'] }, createdBy: { type: 'string', format: 'uuid', nullable: true }, createdAt: { type: 'string', format: 'date-time' }, items: { type: 'array', items: schema('SaleItem'), description: 'Incluido al listar o crear ventas; no se devuelve al cancelar.' } } },
      SaleResponse: { type: 'object', required: ['sale'], properties: { sale: schema('Sale') } },
      SaleCreatedResponse: { type: 'object', required: ['sale'], properties: { sale: { allOf: [schema('Sale'), { type: 'object', required: ['items'], properties: { items: { type: 'array', items: schema('SaleItem') } } }] } } },
      SalesResponse: { type: 'object', required: ['sales'], properties: { sales: { type: 'array', items: schema('Sale'), maxItems: 200 } } },
      Dashboard: { type: 'object', required: ['revenueCents', 'salesCount', 'productCount', 'lowStockCount', 'revenueChange', 'recentSales', 'lowStock', 'topProducts', 'salesByDay'], properties: {
        revenueCents: { type: 'integer', description: 'Ingresos de los últimos 30 días' }, salesCount: { type: 'integer', description: 'Ventas completadas en los últimos 30 días' }, productCount: { type: 'integer' }, lowStockCount: { type: 'integer' }, revenueChange: { type: 'integer', nullable: true, description: 'Variación porcentual frente a los 30 días anteriores; null si no hubo ingresos' }, recentSales: { type: 'array', items: schema('Sale'), maxItems: 5 }, lowStock: { type: 'array', items: schema('Product'), maxItems: 5 }, topProducts: { type: 'array', maxItems: 5, items: { type: 'object', required: ['name', 'quantity'], properties: { name: { type: 'string' }, quantity: { type: 'integer' } } } }, salesByDay: { type: 'array', minItems: 7, maxItems: 7, items: { type: 'object', required: ['day', 'totalCents'], properties: { day: { type: 'string', format: 'date' }, totalCents: { type: 'integer' } } } },
      } },
    },
  },
};
