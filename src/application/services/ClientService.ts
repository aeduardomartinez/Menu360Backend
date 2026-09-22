import { Client } from '../../domain/models/Client';
import { IClientRepository } from '../../domain/repositories/IClientRepository';

export class ClientService {
  constructor(private repository: IClientRepository) { }

  async createClient(data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client> {
    // Teléfono y documento (cédula/NIT) son los identificadores reales de un
    // cliente: si cualquiera de los dos ya existe para este restaurante, no
    // se permite crear un cliente nuevo (evita duplicados como "mismo
    // nombre, teléfono distinto por un dígito" que antes solo se detectaban
    // si el teléfono coincidía carácter por carácter).
    if (data.phone && data.phone.trim() !== '') {
      const existing = await this.repository.findByExactPhone(data.restaurantId, data.phone.trim());
      if (existing) {
        throw new Error(`Ya existe un cliente con el número de teléfono ${data.phone.trim()} (${existing.name}).`);
      }
    }
    if (data.documentId && data.documentId.trim() !== '' && this.repository.findByDocumentId) {
      const existingDoc = await this.repository.findByDocumentId(data.restaurantId, data.documentId.trim());
      if (existingDoc) {
        throw new Error(`Ya existe un cliente con el documento ${data.documentId.trim()} (${existingDoc.name}).`);
      }
    }

    try {
      return await this.repository.create(data);
    } catch (err: any) {
      // Condición de carrera: otra solicitud creó, entre nuestra validación
      // y este create, un cliente con el mismo teléfono o documento. La base
      // de datos lo rechaza (índice único) en vez de permitir el duplicado.
      if (err?.code === 'P2002') {
        throw new Error('Ya existe un cliente con ese teléfono o documento (se acaba de registrar desde otra solicitud).');
      }
      throw err;
    }
  }

  async getClientById(id: string): Promise<Client | null> {
    return this.repository.findById(id);
  }

  // Actualiza un cliente ya existente (por ejemplo, para completar la
  // dirección de entrega que le faltaba). Verificamos que el cliente
  // realmente pertenezca a este restaurante antes de tocarlo — el id llega
  // desde el frontend, así que no podemos confiar en que restaurantId venga
  // correcto en el body como sí podemos confiar en el que trae el token.
  async updateClient(id: string, restaurantId: string, updates: Partial<Client>): Promise<Client> {
    const existing = await this.repository.findById(id);
    if (!existing || existing.restaurantId !== restaurantId) {
      throw new Error('Cliente no encontrado.');
    }

    // Mismas validaciones de duplicados que createClient, pero solo si el
    // teléfono o documento realmente están cambiando — de lo contrario un
    // cliente siempre "chocaría contra sí mismo".
    if (updates.phone && updates.phone.trim() !== '' && updates.phone.trim() !== existing.phone) {
      const existingByPhone = await this.repository.findByExactPhone(restaurantId, updates.phone.trim());
      if (existingByPhone && existingByPhone.id !== id) {
        throw new Error(`Ya existe un cliente con el número de teléfono ${updates.phone.trim()} (${existingByPhone.name}).`);
      }
    }
    if (updates.documentId && updates.documentId.trim() !== '' && updates.documentId.trim() !== existing.documentId && this.repository.findByDocumentId) {
      const existingByDoc = await this.repository.findByDocumentId(restaurantId, updates.documentId.trim());
      if (existingByDoc && existingByDoc.id !== id) {
        throw new Error(`Ya existe un cliente con el documento ${updates.documentId.trim()} (${existingByDoc.name}).`);
      }
    }

    if (!this.repository.update) {
      throw new Error('No se pudo actualizar el cliente.');
    }

    try {
      const updated = await this.repository.update(id, updates);
      if (!updated) throw new Error('No se pudo actualizar el cliente.');
      return updated;
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new Error('Ya existe un cliente con ese teléfono o documento.');
      }
      throw err;
    }
  }

  async getClientsByRestaurant(restaurantId: string): Promise<Client[]> {
    return this.repository.findByRestaurant(restaurantId);
  }

  async searchClients(restaurantId: string, query: string): Promise<Client[]> {
    if (!query || query.trim().length === 0) {
      return this.getClientsByRestaurant(restaurantId);
    }
    return this.repository.searchByPhoneOrName(restaurantId, query.trim());
  }

  async getClientByExactPhone(restaurantId: string, phone: string): Promise<Client | null> {
    return this.repository.findByExactPhone(restaurantId, phone.trim());
  }

  async upsertClientByPhone(restaurantId: string, phone: string, data: Partial<Client>): Promise<Client> {
    const existing = await this.getClientByExactPhone(restaurantId, phone);
    if (existing) {
      // Update existing if new info is provided
      const updates: Partial<Client> = {};
      if (data.name && data.name !== existing.name) updates.name = data.name;
      if (data.address && data.address !== existing.address) updates.address = data.address;
      if (data.city && data.city !== existing.city) updates.city = data.city;
      if (data.neighborhood && data.neighborhood !== existing.neighborhood) updates.neighborhood = data.neighborhood;
      if (data.birthDate && (!existing.birthDate || data.birthDate.getTime() !== existing.birthDate.getTime())) {
        updates.birthDate = data.birthDate;
      }
      
      if (Object.keys(updates).length > 0 && this.repository.update) {
        return this.repository.update(existing.id, updates) as Promise<Client>;
      }
      return existing;
    } else {
      // Create new
      try {
        return await this.repository.create({
          restaurantId,
          phone: phone.trim(),
          name: data.name || 'Cliente sin nombre',
          address: data.address,
          neighborhood: data.neighborhood,
          city: data.city,
          birthDate: data.birthDate,
        });
      } catch (err: any) {
        // Condición de carrera: dos pedidos casi simultáneos del mismo
        // teléfono (ej. el cliente hace doble clic, o llega un pedido web y
        // uno de POS casi al mismo tiempo) pueden pasar ambos la búsqueda de
        // "no existe" antes de que cualquiera termine de crearse. El índice
        // único de la base de datos rechaza al segundo; en vez de perder el
        // registro del CRM para ese pedido, recuperamos al que ganó la
        // carrera y lo devolvemos.
        if (err?.code === 'P2002') {
          const raceWinner = await this.getClientByExactPhone(restaurantId, phone);
          if (raceWinner) return raceWinner;
        }
        throw err;
      }
    }
  }

  async upsertClientDIANData(restaurantId: string, invoiceData: any, clientId?: string): Promise<Client | null> {
    if (!this.repository.update) return null;

    let existing: Client | null = null;
    
    if (clientId) {
      existing = await this.getClientById(clientId);
    }
    
    if (!existing && invoiceData.identificacion && invoiceData.identificacion !== '222222222222') {
      if (this.repository.findByDocumentId) {
        existing = await this.repository.findByDocumentId(restaurantId, invoiceData.identificacion);
      }
    }
    
    if (!existing && invoiceData.telefonoContacto) {
      existing = await this.getClientByExactPhone(restaurantId, invoiceData.telefonoContacto);
    }

    const clientName = invoiceData.nombreContacto || invoiceData.nombres || invoiceData.razonSocial || 'Cliente sin nombre';

    if (existing) {
      return this.repository.update(existing.id, {
        name: clientName,
        phone: invoiceData.telefonoContacto || invoiceData.telefono || existing.phone,
        email: invoiceData.emailContacto || invoiceData.email || existing.email,
        documentType: invoiceData.tipoId || invoiceData.tipoDocumento || existing.documentType,
        documentId: invoiceData.identificacion || existing.documentId,
        dv: invoiceData.dv !== undefined ? invoiceData.dv : existing.dv,
        regime: invoiceData.regimenFiscal || invoiceData.regimen || existing.regime,
        responsibilities: invoiceData.responsabilidades || existing.responsibilities,
        department: invoiceData.departamento || existing.department,
        city: invoiceData.municipio || existing.city,
        address: invoiceData.direccion || existing.address
      });
    } else {
      // Only create if we have enough identifying info (at least a document or phone)
      if ((invoiceData.identificacion && invoiceData.identificacion !== '222222222222') || invoiceData.telefonoContacto) {
        try {
          return await this.repository.create({
            restaurantId,
            name: clientName,
            phone: invoiceData.telefonoContacto || invoiceData.telefono,
            email: invoiceData.emailContacto || invoiceData.email,
            documentType: invoiceData.tipoId || invoiceData.tipoDocumento,
            documentId: invoiceData.identificacion,
            dv: invoiceData.dv,
            regime: invoiceData.regimenFiscal || invoiceData.regimen,
            responsibilities: invoiceData.responsabilidades,
            department: invoiceData.departamento,
            city: invoiceData.municipio,
            address: invoiceData.direccion
          });
        } catch (err: any) {
          // Condición de carrera: ya existe un cliente con este mismo
          // teléfono o documento (creado justo entre nuestra búsqueda y este
          // create). Recuperamos ese registro en vez de fallar la factura.
          if (err?.code === 'P2002') {
            const byDoc = invoiceData.identificacion && this.repository.findByDocumentId
              ? await this.repository.findByDocumentId(restaurantId, invoiceData.identificacion)
              : null;
            const byPhone = !byDoc && invoiceData.telefonoContacto
              ? await this.getClientByExactPhone(restaurantId, invoiceData.telefonoContacto)
              : null;
            if (byDoc || byPhone) return byDoc || byPhone;
          }
          throw err;
        }
      }
      return null;
    }
  }
}
