import { Order } from '../../domain/models/Order';
import { ClientDIAN } from '../../domain/models/Client';

// Lo que devuelve sendInvoice, ya normalizado, para que BillingService no
// tenga que conocer el formato de respuesta de ningún proveedor en concreto.
export interface DianSendResult {
  success: boolean;
  // true cuando no había proveedor configurado y la respuesta fue simulada.
  simulated: boolean;
  message: string;
  cufe?: string;
  invoiceNumber?: string;
  dianUrl?: string;
  raw?: any;
}

export class DianIntegrationService {
  // La configuración se lee en el momento del envío y no en el constructor:
  // el .env lo carga Prisma al inicializarse, así que leerlo aquí evita
  // depender del orden en que se importan los módulos (y permite cambiar el
  // .env y reiniciar sin tocar código).
  private getConfig() {
    return {
      url: (process.env.DIAN_API_URL || '').trim(),
      token: (process.env.DIAN_API_TOKEN || '').trim(),
      authHeader: (process.env.DIAN_API_KEY_HEADER || '').trim(),
      timeoutMs: Number(process.env.DIAN_API_TIMEOUT_MS) || 15000,
    };
  }

  async sendInvoice(order: Order, client: ClientDIAN): Promise<DianSendResult> {
    try {
      // 1. Formatear los ítems (productos) de la orden según el JSON esperado por el proveedor de la DIAN.
      const listPedidos = order.items.map((item: any, index: number) => {
        // Obtenemos el precio unitario del item. unitPrice o price.
        const unitSalePrice = (item.unitPrice || item.price || 0).toFixed(2);
        
        // El impuesto es opcional
        const tax = item.taxPercentage ? item.taxPercentage.toFixed(2) : null;
        const product = item.product || {};
        
        const categoryName = product.category || "SIN_CATEGORIA";
        const categoryPrefix = categoryName.substring(0, 3).toUpperCase();
        
        return {
          category: categoryName,
          productName: product.name || item.name || "Producto sin nombre",
          internalCode: product.id ? `${categoryPrefix}-${product.id.substring(0,8)}` : `${categoryPrefix}-${index}`,
          available: product.currentStock || 100, // Dummy stock if not tracking
          unitSalePrice: unitSalePrice,
          discount: null, // Asumimos nulo a menos que lo extraigamos del producto
          tax: tax,
          detailProductId: product.id || `prod-detail-${index}`,
          idCategory: product.categoryId || `cat-${index}`,
          idProduct: product.id || `prod-${index}`,
          id: Date.now() + index, // Un id numérico como el de ejemplo
          quantity: item.quantity || 1
        };
      });

      const itemsTotal = order.items.reduce((sum: number, item: any) => sum + ((item.unitPrice || item.price || 0) * (item.quantity || 1)), 0);
      const deliveryCost = order.totalAmount - itemsTotal;
      if (deliveryCost > 0 && order.deliveryType === 'DELIVERY') {
        listPedidos.push({
          category: 'SERVICIOS',
          productName: 'Servicio a Domicilio',
          internalCode: 'SER-DOMICILIO',
          available: 999,
          unitSalePrice: deliveryCost.toFixed(2),
          discount: null,
          tax: null,
          detailProductId: 'servicio-domicilio',
          idCategory: 'cat-servicios',
          idProduct: 'prod-domicilio',
          id: Date.now() + 9999,
          quantity: 1
        });
      }

      // 2. Extraer y formatear los datos del cliente (Receptor de la Factura).
      // Validación estricta: No usar datos quemados (fallbacks), todo debe venir del cliente.
      // Excepción: Si no hay identificación, la norma permite 222222222222 (Consumidor Final).
      const document = client.identificacion || "222222222222";
      const documentType = document === "222222222222" ? "CF" : (client.tipoId || "CC");

      if (!client.tipoId && document !== "222222222222") throw new Error("El tipo de documento es obligatorio.");
      if (!client.emailContacto) throw new Error("El correo electrónico es obligatorio para el envío de la factura.");
      if (!client.telefonoContacto) throw new Error("El teléfono de contacto es obligatorio.");
      if (!client.municipio || !client.departamento) throw new Error("El departamento y municipio son obligatorios.");
      if (!client.direccion) throw new Error("La dirección es obligatoria.");
      const personType = client.tipoPersona || (documentType === 'NIT' ? 'juridica' : 'natural');
      
      const payload = {
        personType: personType, 
        documentType: documentType,
        document: document,
        paymentMethod: this.mapPaymentMethod(order.paymentMethod),
        received: order.totalAmount, 
        change: 0,
        listPedidos: listPedidos,
        electronicInvoice: true,
        receptor: {
          razonSocial: client.razonSocial || client.nombreContacto,
          tipoIdentificacion: documentType,
          identificacion: document,
          dv: client.dv || "",
          regimen: client.regimenFiscal, 
          codigoPais: "CO",
          idDepartamento: client.departamento, 
          departamento: client.departamento,
          idMunicipio: client.municipio, 
          municipio: client.municipio,
          ciudad: client.municipio,
          direccion: client.direccion,
          email: client.emailContacto,
          telefono: client.telefonoContacto,
          oyR: client.responsabilidades ? [
            {
              codigo: client.responsabilidades,
              nombre: this.mapResponsabilidadName(client.responsabilidades)
            }
          ] : [],
          tipoOrganizacion: personType === 'juridica' ? "xxxxx-1" : "xxxxx-4"
        }
      };

      const { url, timeoutMs } = this.getConfig();

      console.log('--- ENVIANDO FACTURA A DIAN ---');
      console.log('Endpoint:', url || '(DIAN_API_URL sin configurar → modo simulación)');
      console.log('Payload JSON:\n', JSON.stringify(payload, null, 2));

      // Sin proveedor configurado no se llama a nadie: se deja el payload en
      // la consola (sirve para revisarlo contra la documentación del
      // proveedor) y se devuelve una respuesta simulada, que es como venía
      // funcionando. Basta con poner DIAN_API_URL en el .env y reiniciar para
      // que el envío pase a ser real, sin tocar una línea de código.
      if (!url) {
        return {
          success: true,
          simulated: true,
          message: 'DIAN_API_URL sin configurar: la factura NO se envió a ningún proveedor (simulación).',
        };
      }

      const result = await this.postToProvider(url, payload, timeoutMs);

      return {
        success: true,
        simulated: false,
        message: 'Factura enviada al proveedor de facturación electrónica',
        cufe: this.pickField(result, ['cufe', 'CUFE', 'uuid', 'trackId', 'trackID']),
        invoiceNumber: this.pickField(result, ['invoiceNumber', 'number', 'numero', 'documentNumber', 'prefixNumber', 'fullNumber']),
        dianUrl: this.pickField(result, ['dianUrl', 'qrUrl', 'qr', 'pdfUrl', 'urlPdf', 'publicUrl', 'url']),
        raw: result,
      };

    } catch (error) {
      console.error('Error in DianIntegrationService:', error);
      throw error;
    }
  }

  /**
   * Hace el POST al proveedor y devuelve su respuesta ya parseada. Cualquier
   * fallo (sin red, timeout, HTTP de error) sale como Error con un mensaje
   * legible, para que quede claro en los logs qué respondió el proveedor.
   */
  private async postToProvider(url: string, payload: any, timeoutMs: number): Promise<any> {
    const { token, authHeader } = this.getConfig();

    // Se toma fetch del global (Node 18+). Se resuelve así, y no con el tipo
    // global, para que compile igual sin importar la versión de @types/node
    // que tenga instalada el proyecto.
    const fetchFn: any = (globalThis as any).fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error('Esta versión de Node no tiene fetch disponible (se necesita Node 18 o superior) para enviar la factura al proveedor.');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (token) {
      if (authHeader) headers[authHeader] = token;
      else headers['Authorization'] = `Bearer ${token}`;
    }

    // Timeout con AbortController en vez de AbortSignal.timeout, que no existe
    // en todas las versiones de Node donde sí existe fetch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: any;
    try {
      response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`El proveedor de facturación no respondió en ${timeoutMs} ms (${url}).`);
      }
      throw new Error(`No se pudo conectar con el proveedor de facturación (${url}): ${err?.message || err}`);
    } finally {
      clearTimeout(timer);
    }

    const rawBody: string = await response.text().catch(() => '');
    let parsed: any = {};
    try {
      parsed = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsed = { raw: rawBody }; // El proveedor respondió algo que no es JSON
    }

    if (!response.ok) {
      throw new Error(`El proveedor rechazó la factura (HTTP ${response.status}): ${rawBody.slice(0, 500) || response.statusText}`);
    }

    console.log('--- RESPUESTA DEL PROVEEDOR ---');
    console.log(rawBody.slice(0, 2000) || '(respuesta vacía)');

    return parsed;
  }

  /**
   * Cada proveedor le pone un nombre distinto al CUFE, al número autorizado y
   * a la URL pública de la factura. Se buscan los nombres más comunes en la
   * raíz de la respuesta y un nivel más adentro; cuando mañana se vea la
   * respuesta real (queda impresa completa en la consola), basta con agregar
   * el nombre exacto a la lista correspondiente en sendInvoice.
   */
  private pickField(source: any, keys: string[]): string | undefined {
    const containers = [source, source?.data, source?.invoice, source?.result, source?.document, source?.response]
      .filter((container) => container && typeof container === 'object');

    for (const container of containers) {
      for (const key of keys) {
        const value = container[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number') return String(value);
      }
    }
    return undefined;
  }

  private mapPaymentMethod(method: string): string {
    const methodLower = method?.toLowerCase() || '';
    if (methodLower.includes('cash') || methodLower.includes('efectivo')) return 'cash';
    if (methodLower.includes('transfer') || methodLower.includes('nequi') || methodLower.includes('bancolombia')) return 'transfer';
    if (methodLower.includes('card') || methodLower.includes('tarjeta')) return 'credit_card';
    return 'transfer'; // Default fallback
  }

  private mapResponsabilidadName(codigo: string): string {
    const map: Record<string, string> = {
      "O-13": "Gran Contribuyente",
      "O-15": "Autorretenedor",
      "O-23": "Agente de Retención IVA",
      "O-47": "Régimen Simple de Tributación (SIMPLE)",
      "R-99-PN": "No responsable de IVA - Persona Natural"
    };
    return map[codigo] || "Obligación Tributaria";
  }
}
