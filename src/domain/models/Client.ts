export interface ClientDIAN {
  id: string; // Internal ID
  documentType: 'CC' | 'NIT' | 'CE' | 'PASSPORT';
  documentNumber: string;
  businessName: string; // Razón social o nombres/apellidos
  address: string;
  phone: string;
  email: string;
  fiscalRegime: 'ORDINARY' | 'SIMPLIFIED' | 'SPECIAL'; // Régimen fiscal
}
