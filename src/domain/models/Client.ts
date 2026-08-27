export interface Client {
  id: string;
  restaurantId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  birthDate?: Date | null;
  documentType?: string | null;
  documentId?: string | null;
  dv?: string | null;
  regime?: string | null;
  responsibilities?: string | null;
  department?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClientDIAN {
  tipoPersona?: string;
  razonSocial: string;
  tipoId: string;
  identificacion: string;
  dv: string;
  regimenFiscal: string;
  responsabilidades: string;
  departamento: string;
  municipio: string;
  direccion: string;
  nombreContacto: string;
  telefonoContacto: string;
  emailContacto: string;
}
