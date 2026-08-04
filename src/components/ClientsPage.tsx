import React, { useState, useEffect } from 'react';
import { Client, Rental, Language } from '../types';
import { ClientCard } from './ClientCard';
import { ClientModal } from './ClientModal';
import { ClientDetailsModal } from './ClientDetailsModal';
import { ClientHistoryModal } from './ClientHistoryModal';
import { ConfirmModal } from './ConfirmModal';
import { Plus } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { DatabaseService } from '../services/DatabaseService';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, Toolbar, SearchInput, Btn,
  EmptyState, LoadingState, ErrorBanner,
} from './ui/fx';

interface ClientsPageProps {
  lang: Language;
  isAuthLoading?: boolean;
  user?: any;
}

// Mock rentals for history
const MOCK_RENTALS: Rental[] = [
  {
    id: '1',
    carId: '1',
    clientId: '1',
    startDate: '2024-01-15',
    endDate: '2024-01-20',
    totalCost: 125000,
    status: 'completed',
  },
  {
    id: '2',
    carId: '2',
    clientId: '1',
    startDate: '2024-02-10',
    endDate: '2024-02-15',
    totalCost: 150000,
    status: 'completed',
  },
];

export const ClientsPage: React.FC<ClientsPageProps> = ({ lang, isAuthLoading = false, user = null }) => {
  const can = useCan('clients');
  const [clients, setClients] = useState<Client[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load clients from database
  useEffect(() => {
    // Skip loading if authentication is still in progress or user not available
    if (isAuthLoading) return;
    if (!user) return;

    const loadClients = async () => {
      setLoading(true);
      try {
        const list = await DatabaseService.getClients();
        setClients(list);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load clients:', err);
        if (err.message?.includes('JWT') || err.message?.includes('auth') || err.code === 'PGRST301') {
          setError('Session expirée. Veuillez vous reconnecter.');
        } else {
          setError('Impossible de charger les clients');
        }
      } finally {
        setLoading(false);
      }
    };
    loadClients();
  }, [user, isAuthLoading]);

  const filteredClients = clients.filter(client =>
    `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone.includes(searchTerm) ||
    client.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddClient = () => {
    setSelectedClient(undefined);
    setIsModalOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailsOpen(true);
  };

  const handleViewHistory = (client: Client) => {
    setSelectedClient(client);
    setIsHistoryOpen(true);
  };

  const handleDeleteClick = (id: string) => {
    setDeleteTarget(id);
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deleteTarget) {
      try {
        await DatabaseService.deleteClient(deleteTarget);
        setClients(prev => prev.filter(c => c.id !== deleteTarget));
      } catch (err) {
        console.error('Failed to delete client:', err);
        setError('Erreur lors de la suppression');
      }
      setDeleteTarget(null);
    }
  };

  const handleSaveClient = async (clientData: Partial<Client>): Promise<void> => {
    try {
      if (selectedClient) {
        // Edit existing
        const updated = await DatabaseService.updateClient(selectedClient.id, clientData);
        setClients(prev => prev.map(c => (c.id === updated.id ? updated : c)));
      } else {
        // Create new
        const created = await DatabaseService.createClient(clientData as Omit<Client, 'id' | 'created_at'>);
        setClients(prev => [...prev, created]);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving client:', err);
      throw new Error('Erreur lors de l\'enregistrement');
    }
  };

  const fr = lang === 'fr';

  // Un permis périmé bloque une location : ces clients passent en tête.
  const expiredCount = clients.filter(c => {
    const exp = c.licenseExpirationDate ?? (c as any).licenseExpiration;
    return exp && new Date(exp).getTime() < Date.now();
  }).length;

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="👥"
        eyebrow={fr ? 'Répertoire' : 'الدليل'}
        title={fr ? 'Clients' : 'العملاء'}
        subtitle={fr ? 'Fiches, documents et historique de location.' : 'البطاقات والمستندات وسجل الإيجار.'}
        actions={
          can('create') ? (
            <Btn tone="primary" onClick={handleAddClient}>
              <Plus size={16} />
              {fr ? 'Nouveau client' : 'عميل جديد'}
            </Btn>
          ) : null
        }
      />

      {error && (
        <ErrorBanner
          message={error}
          onRetry={() => window.location.reload()}
          retryLabel={fr ? 'Se reconnecter' : 'إعادة الاتصال'}
        />
      )}

      <div className="mb-5">
        <StatGrid cols={3}>
          <StatCard label={fr ? 'Clients' : 'العملاء'} value={clients.length} icon="👥" tone="steel" />
          <StatCard
            label={fr ? 'Permis expirés' : 'رخص منتهية'}
            value={expiredCount}
            hint={fr ? 'Location impossible en l’état' : 'الإيجار غير ممكن'}
            icon="⛔"
            tone={expiredCount > 0 ? 'red' : 'green'}
          />
          <StatCard
            label={fr ? 'Résultats affichés' : 'النتائج'}
            value={filteredClients.length}
            icon="🔍"
            tone="steel"
          />
        </StatGrid>
      </div>

      <Toolbar>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={fr ? 'Nom, téléphone, e-mail, permis…' : 'الاسم، الهاتف، البريد…'}
        />
      </Toolbar>

      {loading ? (
        <LoadingState label={fr ? 'Chargement des clients…' : 'جاري التحميل…'} rows={6} />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon="👥"
          title={clients.length === 0 ? (fr ? 'Aucun client' : 'لا عملاء') : (fr ? 'Aucun résultat' : 'لا نتائج')}
          description={
            clients.length === 0
              ? (fr ? 'Créez votre première fiche client pour lancer une réservation.' : 'أنشئ أول بطاقة عميل.')
              : (fr ? 'Essayez un autre terme de recherche.' : 'جرّب بحثًا آخر.')
          }
          action={
            clients.length === 0 && can('create') ? (
              <Btn tone="primary" onClick={handleAddClient}>
                <Plus size={16} /> {fr ? 'Nouveau client' : 'عميل جديد'}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          <AnimatePresence mode="popLayout">
            {filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                lang={lang}
                can={can}
                onEdit={() => handleEditClient(client)}
                onDelete={() => handleDeleteClick(client.id)}
                onViewDetails={() => handleViewDetails(client)}
                onHistory={() => handleViewHistory(client)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Modals */}
      <ClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveClient}
        client={selectedClient}
        lang={lang}
      />

      {selectedClient && (
        <>
          <ClientDetailsModal
            isOpen={isDetailsOpen}
            onClose={() => setIsDetailsOpen(false)}
            client={selectedClient}
            lang={lang}
          />

          <ClientHistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            client={selectedClient}
            rentals={MOCK_RENTALS.filter(r => r.clientId === selectedClient.id)}
            lang={lang}
          />
        </>
      )}

      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => {
          setIsConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={handleConfirmDelete}
        title={{
          fr: '🗑️ Supprimer Client',
          ar: '🗑️ حذف العميل',
        }}
        message={{
          fr: 'Êtes-vous certain de vouloir supprimer ce client ? Cette action est irréversible.',
          ar: 'هل تريد بالتأكيد حذف هذا العميل؟ هذا الإجراء غير قابل للعكس.',
        }}
        lang={lang}
      />
    </div>
  );
};
