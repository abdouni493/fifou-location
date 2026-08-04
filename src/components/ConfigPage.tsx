import React, { useState, useEffect } from 'react';
import { Language, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { DatabaseService } from '../services/DatabaseService';
import { supabase } from '../supabase';
import { sessionService } from '../utils/sessionService';
import { uploadWebsiteImage } from '../services/uploadWebsiteImage';

interface ConfigPageProps {
  lang: Language;
  user: User;
}

export const ConfigPage: React.FC<ConfigPageProps> = ({ lang, user }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'database'>('general');
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // General Settings - Load from website settings
  const [generalData, setGeneralData] = useState({
    agencyName: '',
    slogan: '',
    address: '',
    phone: '',
    phoneNumber2: '',
    bankNumber: '',
    logo: '',
  });

  // Deux natures de comptes, deux chemins d'écriture :
  //  • admin   → compte Supabase Auth (auth.users + `profiles`). Une fois sa
  //              session SDK restaurée, il écrit directement dans les tables.
  //  • employé → ligne de `workers`. Sa session applicative n'est pas une session
  //              Supabase : le client reste `anon`, pour qui RLS interdit `workers`.
  //              Lecture et écriture passent donc par des RPC SECURITY DEFINER
  //              qui vérifient le mot de passe actuel (cf. migration
  //              20260711_profile_and_security_update.sql).
  const isAdmin = user.role === 'admin';

  // Profile Settings
  const [profileData, setProfileData] = useState({
    name: user.name,
    profilePhoto: user.avatar,
  });
  /** Mot de passe actuel exigé de l'employé pour écrire via la RPC. */
  const [profilePassword, setProfilePassword] = useState('');

  // Security Settings
  const [securityData, setSecurityData] = useState({
    username: '',
    email: user.email,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);

  // Database
  const [lastBackup] = useState('Aujourd\'hui à 10:45');

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load website settings for general tab.
        // Aucune valeur de démonstration ici : le formulaire est réenvoyé tel
        // quel à la sauvegarde, et ces exemples ("Luxdrive Premium", un logo
        // picsum.photos…) finissaient enregistrés comme identité de l'agence.
        const websiteSettings = await DatabaseService.getWebsiteSettings();
        setGeneralData({
          agencyName: websiteSettings.name || '',
          slogan: websiteSettings.description || '',
          address: websiteSettings.address || '',
          phone: websiteSettings.phone || '',
          phoneNumber2: websiteSettings.phone_number_2 || '',
          bankNumber: websiteSettings.bank_number || '',
          logo: websiteSettings.logo || '',
        });

        // Profil + sécurité.
        // Admin : sa ligne `profiles` est lisible par tous (policy profiles_public_read).
        // Employé : sa fiche `workers` n'est lisible qu'en présentant son mot de
        // passe, qu'on n'a pas ici — on part donc des valeurs de la session, et le
        // nom d'utilisateur reste vide jusqu'à ce qu'il le saisisse (la RPC de
        // mise à jour conserve l'existant quand un champ est laissé vide).
        if (user.email && isAdmin) {
          try {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('email', user.email)
              .maybeSingle();

            if (!error && profile) {
              setProfileData({
                name: profile.full_name || user.name,
                profilePhoto: profile.profile_photo || user.avatar || '',
              });

              setSecurityData(prev => ({
                ...prev,
                username: profile.username || '',
                email: profile.email || user.email,
              }));
            }
          } catch (profileError) {
            console.warn('Could not load profile data:', profileError);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading config data:', error);
        setLoading(false);
      }
    };

    loadData();
  }, [user.email, isAdmin]);

  const handleGeneralChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setGeneralData(prev => ({ ...prev, [name]: value }));
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handleSecurityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSecurityData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveAgencyInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      // Save to website settings
      await DatabaseService.updateWebsiteSettings({
        name: generalData.agencyName,
        description: generalData.slogan,
        logo: generalData.logo,
        phone_number_2: generalData.phoneNumber2,
        bank_number: generalData.bankNumber,
        address: generalData.address,
        phone: generalData.phone,
      });

      setNotification({ type: 'success', message: lang === 'fr' ? 'Informations de l\'agence mises à jour avec succès!' : 'تم تحديث معلومات الوكالة بنجاح!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error('Error updating agency info:', error);
      setNotification({ type: 'error', message: lang === 'fr' ? 'Erreur lors de la mise à jour des informations' : 'خطأ في تحديث المعلومات' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  /** Affiche une notification et la retire au bout de quelques secondes. */
  const notify = (type: 'success' | 'error', message: string, ms = 5000) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), ms);
  };

  const tr = (fr: string, ar: string) => (lang === 'fr' ? fr : ar);

  /**
   * `profiles.profile_photo` manque tant que la migration n'a pas été jouée.
   * PostgREST répond PGRST204 (colonne absente du cache de schéma) ; PostgreSQL
   * répond 42703 quand la requête atteint la base.
   */
  const isMissingPhotoColumn = (error: { code?: string; message?: string } | null): boolean =>
    !!error && (error.code === 'PGRST204' || error.code === '42703') && /profile_photo/.test(error.message || '');

  /** Traduit les erreurs métier levées par les RPC en message lisible. */
  const rpcErrorMessage = (message: string): string => {
    if (message.includes('WRONG_PASSWORD')) return tr('Mot de passe actuel incorrect.', 'كلمة المرور الحالية غير صحيحة.');
    if (message.includes('EMAIL_TAKEN')) return tr('Cet e-mail est déjà utilisé par un autre compte.', 'هذا البريد الإلكتروني مستخدم بالفعل.');
    if (message.includes('WORKER_NOT_FOUND')) return tr('Compte introuvable.', 'الحساب غير موجود.');
    if (message.includes('update_worker_account')) {
      return tr(
        "La fonction update_worker_account n'existe pas encore. Exécutez la migration supabase/migrations/20260711_profile_and_security_update.sql.",
        'دالة update_worker_account غير موجودة بعد. نفّذ ملف الترحيل.'
      );
    }
    return message;
  };

  /**
   * Restaure la session Supabase de l'admin (le client tourne en
   * `persistSession: false`, donc après un rechargement le SDK repasse en `anon`
   * et RLS rejette silencieusement toute écriture).
   */
  const requireAdminSession = async (): Promise<boolean> => {
    if (await sessionService.ensureSupabaseSession()) return true;
    notify('error', tr(
      'Votre session a expiré. Reconnectez-vous avant de modifier vos informations.',
      'انتهت صلاحية جلستك. أعد تسجيل الدخول قبل تعديل معلوماتك.'
    ));
    return false;
  };

  // ─── Profil : nom affiché + photo ────────────────────────────────────────────
  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = profileData.name.trim();
    if (!name) {
      notify('error', tr('Le nom complet ne peut pas être vide.', 'لا يمكن أن يكون الاسم الكامل فارغًا.'));
      return;
    }
    if (!isAdmin && !profilePassword) {
      notify('error', tr(
        'Saisissez votre mot de passe actuel pour enregistrer votre profil.',
        'أدخل كلمة المرور الحالية لحفظ ملفك الشخصي.'
      ));
      return;
    }

    setSavingProfile(true);
    try {
      let photoSkipped = false;

      if (isAdmin) {
        if (!(await requireAdminSession())) return;

        const { error } = await supabase
          .from('profiles')
          .update({ full_name: name, profile_photo: profileData.profilePhoto || null })
          .eq('email', user.email);

        // `profiles.profile_photo` n'existe que depuis la migration
        // 20260711_profile_and_security_update.sql. Tant qu'elle n'est pas jouée,
        // le nom doit tout de même pouvoir être enregistré.
        if (isMissingPhotoColumn(error)) {
          photoSkipped = true;
          const { error: retryError } = await supabase
            .from('profiles')
            .update({ full_name: name })
            .eq('email', user.email);
          if (retryError) throw retryError;
        } else if (error) {
          throw error;
        }

        // Garde auth.users aligné : c'est ce que la page de connexion relit.
        const { error: metaError } = await supabase.auth.updateUser({ data: { full_name: name } });
        if (metaError) console.warn('Auth metadata update failed:', metaError);
      } else {
        const { error } = await supabase.rpc('update_worker_account', {
          p_email: user.email,
          p_current_password: profilePassword,
          p_full_name: name,
          p_profile_photo: profileData.profilePhoto || null,
        });
        if (error) throw error;
        setProfilePassword('');
      }

      notify(
        photoSkipped ? 'error' : 'success',
        photoSkipped
          ? tr(
              "Nom enregistré, mais la photo n'a pas pu l'être : exécutez la migration supabase/migrations/20260711_profile_and_security_update.sql.",
              'تم حفظ الاسم، لكن تعذر حفظ الصورة: نفّذ ملف الترحيل 20260711_profile_and_security_update.sql.'
            )
          : tr(
              'Profil mis à jour. Le nouveau nom apparaîtra à la prochaine connexion.',
              'تم تحديث الملف الشخصي. سيظهر الاسم الجديد عند تسجيل الدخول التالي.'
            ),
        photoSkipped ? 8000 : 5000
      );
    } catch (error: any) {
      console.error('Error updating profile:', error);
      notify('error', rpcErrorMessage(error?.message || tr('erreur inconnue', 'خطأ غير معروف')));
    } finally {
      setSavingProfile(false);
    }
  };

  // ─── Sécurité : nom d'utilisateur, e-mail, mot de passe ──────────────────────
  const handleSaveSecurity = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const username = securityData.username.trim();
    const newEmail = securityData.email.trim().toLowerCase();
    const { currentPassword, newPassword, confirmPassword } = securityData;

    const wantsNewPassword = newPassword.length > 0;
    const emailChanged = newEmail !== (user.email || '').toLowerCase();

    if (!newEmail) {
      notify('error', tr("L'e-mail ne peut pas être vide.", 'لا يمكن أن يكون البريد الإلكتروني فارغًا.'));
      return;
    }
    if (wantsNewPassword && newPassword.length < 6) {
      notify('error', tr('Le mot de passe doit contenir au moins 6 caractères.', 'يجب أن تحتوي كلمة المرور على 6 أحرف على الأقل.'));
      return;
    }
    if (wantsNewPassword && newPassword !== confirmPassword) {
      notify('error', tr('Les deux mots de passe ne correspondent pas.', 'كلمتا المرور غير متطابقتين.'));
      return;
    }
    // Modifier un identifiant exige de prouver qu'on est bien le titulaire du compte.
    if (!currentPassword) {
      notify('error', tr(
        'Saisissez votre mot de passe actuel pour modifier vos informations de connexion.',
        'أدخل كلمة المرور الحالية لتعديل معلومات تسجيل الدخول.'
      ));
      return;
    }

    setSavingSecurity(true);
    try {
      if (isAdmin) {
        // `signInWithPassword` vérifie le mot de passe actuel ET ouvre la session
        // dont `updateUser` a besoin. On la laisse ouverte : c'est exactement
        // l'état que `ensureSupabaseSession` rétablirait de toute façon.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (signInError) {
          notify('error', tr('Mot de passe actuel incorrect.', 'كلمة المرور الحالية غير صحيحة.'));
          return;
        }

        const payload: { email?: string; password?: string; data: Record<string, string> } = {
          data: { username, full_name: profileData.name.trim() },
        };
        if (emailChanged) payload.email = newEmail;
        if (wantsNewPassword) payload.password = newPassword;

        const { error: updateError } = await supabase.auth.updateUser(payload);
        if (updateError) throw updateError;

        // Miroir applicatif (rôle, recherche par e-mail) — non bloquant.
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ username, email: newEmail })
          .eq('email', user.email);
        if (profileError) console.warn('Profile mirror update failed:', profileError);
      } else {
        const { error } = await supabase.rpc('update_worker_account', {
          p_email: user.email,
          p_current_password: currentPassword,
          p_username: username,
          p_new_email: newEmail,
          p_new_password: wantsNewPassword ? newPassword : null,
        });
        if (error) throw error;
      }

      // Les champs de mot de passe ne survivent jamais à une sauvegarde.
      setSecurityData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));

      // Un admin qui change d'e-mail doit confirmer via le lien reçu : tant qu'il
      // ne l'a pas fait, l'ancienne adresse reste celle qui permet de se connecter.
      const emailNotice = emailChanged && isAdmin
        ? tr(
            " Un e-mail de confirmation a été envoyé à la nouvelle adresse : la modification ne prendra effet qu'après validation.",
            ' تم إرسال رسالة تأكيد إلى العنوان الجديد: لن يسري التغيير إلا بعد التحقق.'
          )
        : '';
      const reloginNotice = wantsNewPassword || emailChanged
        ? tr(' Reconnectez-vous avec vos nouveaux identifiants.', ' أعد تسجيل الدخول ببياناتك الجديدة.')
        : '';

      notify(
        'success',
        tr('Informations de connexion mises à jour.', 'تم تحديث معلومات تسجيل الدخول.') + emailNotice + reloginNotice,
        7000
      );
    } catch (error: any) {
      console.error('Error updating security info:', error);
      notify('error', rpcErrorMessage(error?.message || tr('erreur inconnue', 'خطأ غير معروف')));
    } finally {
      setSavingSecurity(false);
    }
  };

  // Lit un fichier en Data URL — repli quand le Storage est inaccessible.
  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setNotification({ type: 'error', message: lang === 'fr' ? 'Veuillez sélectionner une image valide' : 'يرجى تحديد صورة صحيحة' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setNotification({ type: 'error', message: lang === 'fr' ? 'La taille du fichier ne doit pas dépasser 10MB' : 'حجم الملف لا يجب أن يتجاوز 10MB' });
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    try {
      // On téléverse dans le bucket "website" et on ne stocke que l'URL publique
      // (courte). Un logo en base64 gonflait la ligne UNIQUE `website_settings`
      // — relue à chaque page (connexion, sidebar) et recopiée dans
      // `agency_settings` par trigger — au point de faire échouer l'upsert.
      // Repli en base64 si le Storage refuse (session/RLS), pour ne jamais
      // bloquer la mise à jour du logo.
      const uploaded = await uploadWebsiteImage(file, 'logo');
      const logoValue = uploaded.success && uploaded.url
        ? uploaded.url
        : await fileToDataUrl(file);

      setGeneralData(prev => ({ ...prev, logo: logoValue }));
      await DatabaseService.updateWebsiteSettings({ logo: logoValue });

      setNotification({ type: 'success', message: lang === 'fr' ? 'Logo mis à jour avec succès!' : 'تم تحديث الشعار بنجاح!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error('Error updating logo:', error);
      setNotification({ type: 'error', message: lang === 'fr' ? 'Erreur lors de la mise à jour du logo' : 'خطأ في تحديث الشعار' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setNotification({ type: 'error', message: lang === 'fr' ? 'Veuillez sélectionner une image valide' : 'يرجى تحديد صورة صحيحة' });
        setTimeout(() => setNotification(null), 4000);
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setNotification({ type: 'error', message: lang === 'fr' ? 'La taille du fichier ne doit pas dépasser 5MB' : 'حجم الملف لا يجب أن يتجاوز 5MB' });
        setTimeout(() => setNotification(null), 4000);
        return;
      }

      try {
        // Un admin écrit dans le Storage sous le rôle `authenticated` : sa session
        // SDK doit être rétablie, sinon RLS rejette l'upload.
        if (isAdmin) await sessionService.ensureSupabaseSession();

        // Upload to Supabase storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.email}_profile.${fileExt}`;
        const filePath = `workers/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('workers')
          .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('workers')
          .getPublicUrl(filePath);

        // La photo n'est que téléversée ici : elle est enregistrée sur le compte
        // avec le reste du profil (un employé doit d'abord saisir son mot de passe).
        setProfileData(prev => ({
          ...prev,
          profilePhoto: urlData.publicUrl,
        }));

        notify('success', tr(
          'Photo téléversée. Cliquez sur « Enregistrer » pour l\'appliquer à votre profil.',
          'تم رفع الصورة. اضغط على «حفظ» لتطبيقها على ملفك الشخصي.'
        ));
      } catch (error) {
        console.error('Error uploading profile photo:', error);
        notify('error', tr('Erreur lors du téléversement de la photo', 'خطأ في رفع الصورة'));
      }
    }
  };

  const handleExportDatabase = async () => {
    try {
      setNotification({ type: 'success', message: lang === 'fr' ? 'Exportation en cours...' : 'جاري التصدير...' });
      setTimeout(() => setNotification(null), 2000);

      // Export all data from main tables
      const [
        cars,
        clients,
        agencies,
        workers,
        specialOffers,
        storeExpenses,
        vehicleExpenses,
        websiteContacts,
        websiteSettings
      ] = await Promise.all([
        DatabaseService.getCars(),
        DatabaseService.getClients(),
        DatabaseService.getAgencies(),
        DatabaseService.getWorkers(),
        DatabaseService.getSpecialOffers(),
        DatabaseService.getStoreExpenses(),
        DatabaseService.getVehicleExpenses(),
        DatabaseService.getWebsiteContacts(),
        DatabaseService.getWebsiteSettings(),
      ]);

      const backupData = {
        timestamp: new Date().toISOString(),
        version: '1.0',
        data: {
          cars,
          clients,
          agencies,
          workers,
          specialOffers,
          storeExpenses,
          vehicleExpenses,
          websiteContacts,
          websiteSettings,
        }
      };

      // Create and download JSON file
      const dataStr = JSON.stringify(backupData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `luxdrive_backup_${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

      setNotification({ type: 'success', message: lang === 'fr' ? 'Sauvegarde téléchargée avec succès!' : 'تم تنزيل النسخة الاحتياطية بنجاح!' });
      setTimeout(() => setNotification(null), 4000);
    } catch (error) {
      console.error('Error exporting database:', error);
      setNotification({ type: 'error', message: lang === 'fr' ? 'Erreur lors de l\'exportation' : 'خطأ في التصدير' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  const handleRestoreDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const backupData = JSON.parse(event.target?.result as string);

          if (!backupData.data) {
            throw new Error('Invalid backup file format');
          }

          setNotification({ type: 'success', message: lang === 'fr' ? 'Restauration en cours...' : 'جاري الاستعادة...' });
          setTimeout(() => setNotification(null), 2000);

          // Restore data in order (respecting foreign key constraints)
          const { data } = backupData;

          // Clear existing data first (optional - uncomment if you want to replace all data)
          // await clearAllData();

          // Restore agencies first (no dependencies)
          if (data.agencies?.length > 0) {
            for (const agency of data.agencies) {
              await DatabaseService.createAgency(agency);
            }
          }

          // Restore workers (no dependencies)
          if (data.workers?.length > 0) {
            for (const worker of data.workers) {
              await DatabaseService.createWorker(worker);
            }
          }

          // Restore cars (no dependencies)
          if (data.cars?.length > 0) {
            for (const car of data.cars) {
              await DatabaseService.createCar(car);
            }
          }

          // Restore clients (depends on agencies)
          if (data.clients?.length > 0) {
            for (const client of data.clients) {
              await DatabaseService.createClient(client);
            }
          }

          // Les "offres ordinaires" (data.offers) des anciennes sauvegardes sont
          // dépréciées : les voitures s'affichent automatiquement sur le site,
          // il n'y a donc plus rien à restaurer pour elles.

          // Restore special offers (depends on cars)
          if (data.specialOffers?.length > 0) {
            for (const specialOffer of data.specialOffers) {
              await DatabaseService.createSpecialOffer(specialOffer);
            }
          }

          // Restore store expenses (no dependencies)
          if (data.storeExpenses?.length > 0) {
            for (const expense of data.storeExpenses) {
              await DatabaseService.createStoreExpense(expense);
            }
          }

          // Restore vehicle expenses (depends on cars)
          if (data.vehicleExpenses?.length > 0) {
            for (const expense of data.vehicleExpenses) {
              await DatabaseService.createVehicleExpense(expense);
            }
          }

          // Restore website settings
          if (data.websiteSettings) {
            await DatabaseService.updateWebsiteSettings(data.websiteSettings);
          }

          // Restore website contacts
          if (data.websiteContacts) {
            await DatabaseService.updateWebsiteContacts(data.websiteContacts);
          }

          setNotification({ type: 'success', message: lang === 'fr' ? 'Restauration terminée avec succès!' : 'تمت الاستعادة بنجاح!' });
          setTimeout(() => setNotification(null), 4000);

          // Reload page to reflect changes
          setTimeout(() => window.location.reload(), 2000);
        } catch (error) {
          console.error('Error restoring database:', error);
          setNotification({ type: 'error', message: lang === 'fr' ? 'Erreur lors de la restauration' : 'خطأ في الاستعادة' });
          setTimeout(() => setNotification(null), 4000);
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error('Error reading backup file:', error);
      setNotification({ type: 'error', message: lang === 'fr' ? 'Fichier de sauvegarde invalide' : 'ملف نسخة احتياطية غير صالح' });
      setTimeout(() => setNotification(null), 4000);
    }
  };

  return (
    <div className="min-h-full p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-black uppercase tracking-tighter text-saas-text-main mb-2 flex items-center gap-3">
            🛠️ {{fr: 'Configuration', ar: 'الإعدادات'}[lang]}
          </h1>
          <p className="text-saas-text-muted text-sm font-bold uppercase tracking-widest">
            {{fr: 'Gérez les paramètres de votre application', ar: 'إدارة إعدادات التطبيق'}[lang]}
          </p>
        </motion.div>

        {/* Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8 flex flex-col sm:flex-row gap-4"
        >
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'general'
                ? 'fx-modal-head-grad text-white shadow-lg'
                : 'bg-white border-2 border-saas-border text-saas-text-main hover:border-saas-primary-via'
            }`}
          >
            🏢 {{fr: 'Général', ar: 'عام'}[lang]}
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'profile'
                ? 'fx-modal-head-grad text-white shadow-lg'
                : 'bg-white border-2 border-saas-border text-saas-text-main hover:border-saas-primary-via'
            }`}
          >
            👤 {{fr: 'Profil & Sécurité', ar: 'الملف والأمان'}[lang]}
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex-1 py-3 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'database'
                ? 'fx-modal-head-grad text-white shadow-lg'
                : 'bg-white border-2 border-saas-border text-saas-text-main hover:border-saas-primary-via'
            }`}
          >
            💾 {{fr: 'Base de données', ar: 'قاعدة البيانات'}[lang]}
          </button>
        </motion.div>

        {/* Notification Display */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-6 border rounded-2xl p-4 flex items-center justify-between ${
                notification.type === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={notification.type === 'success' ? 'text-green-500' : 'text-red-500'}>
                  {notification.type === 'success' ? '✅' : '❌'}
                </div>
                <p className={`font-medium ${notification.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {notification.message}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-saas-primary-via mx-auto mb-4"></div>
              <p className="text-saas-text-muted font-bold">
                {{fr: 'Chargement des paramètres...', ar: 'جاري تحميل الإعدادات...'}[lang]}
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* GENERAL TAB */}
            {activeTab === 'general' && (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white rounded-[2rem] shadow-lg border border-saas-border overflow-hidden"
            >
              <div className="p-6 border-b border-saas-border fx-modal-head-grad text-white">
                <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                  🏢 {{fr: 'Informations de l\'agence', ar: 'معلومات الوكالة'}[lang]}
                </h2>
              </div>

              <form className="p-8 space-y-6" onSubmit={handleSaveAgencyInfo}>
                {/* Agency Name */}
                <div className="space-y-2">
                  <label className="label-saas">{{fr: 'Nom de l\'enseigne *', ar: 'اسم الإشارة *'}[lang]}</label>
                  <input
                    type="text"
                    name="agencyName"
                    value={generalData.agencyName}
                    onChange={handleGeneralChange}
                    placeholder={{fr: 'Ex : Car Salam', ar: 'مثال: كار سلام'}[lang]}
                    className="input-saas"
                  />
                </div>

                {/* Slogan */}
                <div className="space-y-2">
                  <label className="label-saas">{{fr: 'Slogan commercial', ar: 'الشعار التجاري'}[lang]}</label>
                  <textarea
                    name="slogan"
                    value={generalData.slogan}
                    onChange={handleGeneralChange}
                    rows={2}
                    placeholder={{fr: 'Votre partenaire de confiance en location de véhicules', ar: 'شريكك الموثوق في تأجير السيارات'}[lang]}
                    className="input-saas resize-none"
                  />
                </div>

                {/* Address */}
                <div className="space-y-2">
                  <label className="label-saas">{{fr: 'Adresse du siège', ar: 'عنوان المقر'}[lang]}</label>
                  <input
                    type="text"
                    name="address"
                    value={generalData.address}
                    onChange={handleGeneralChange}
                    className="input-saas"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <label className="label-saas">📞 {{fr: 'Téléphone', ar: 'الهاتف'}[lang]}</label>
                  <input
                    type="tel"
                    name="phone"
                    value={generalData.phone}
                    onChange={handleGeneralChange}
                    className="input-saas"
                  />
                </div>

                {/* Second Phone Number */}
                <div className="space-y-2">
                  <label className="label-saas">📱 {{fr: 'Deuxième numéro de téléphone', ar: 'رقم الهاتف الثاني'}[lang]}</label>
                  <input
                    type="tel"
                    name="phoneNumber2"
                    value={generalData.phoneNumber2}
                    onChange={handleGeneralChange}
                    className="input-saas"
                  />
                </div>

                {/* Bank Number */}
                <div className="space-y-2">
                  <label className="label-saas">🏦 {{fr: 'Numéro de compte bancaire', ar: 'رقم الحساب البنكي'}[lang]}</label>
                  <input
                    type="text"
                    name="bankNumber"
                    value={generalData.bankNumber}
                    onChange={handleGeneralChange}
                    className="input-saas"
                  />
                </div>

                {/* Logo */}
                <div className="space-y-4">
                  <label className="label-saas">🖼️ {{fr: 'Logo de l\'agence', ar: 'شعار الوكالة'}[lang]}</label>
                  <div className="flex gap-6 items-start">
                    <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-saas-border bg-saas-bg flex items-center justify-center flex-shrink-0">
                      {generalData.logo ? (
                        <img src={generalData.logo} alt="Logo" className="w-full h-full object-contain p-1" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-4xl">🏢</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <span className="btn-saas-primary px-6 py-3 inline-block cursor-pointer">
                          {{fr: 'Changer le logo', ar: 'تغيير الشعار'}[lang]}
                        </span>
                      </label>
                      <p className="text-xs text-saas-text-muted mt-2">
                        {{fr: 'Format recommandé: PNG ou JPG (500x500px) · 10 Mo max', ar: 'الصيغة الموصى بها: PNG أو JPG (500x500px) · 10 ميغابايت كحد أقصى'}[lang]}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="flex gap-3 pt-6 border-t border-saas-border">
                  <button
                    type="button"
                    className="flex-1 py-3 px-4 rounded-lg font-bold text-sm bg-white border-2 border-saas-border hover:bg-saas-bg-light transition-colors text-saas-text-main"
                  >
                    {{fr: 'Annuler', ar: 'إلغاء'}[lang]}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-saas-primary py-3"
                  >
                    {{fr: 'Enregistrer les modifications', ar: 'حفظ التغييرات'}[lang]}
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* PROFILE & SECURITY TAB */}
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Profile Section */}
              <div className="bg-white rounded-[2rem] shadow-lg border border-saas-border overflow-hidden">
                <div className="p-6 border-b border-saas-border bg-linear-to-r from-blue-500 via-blue-600 to-blue-700 text-white">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">👤 {{fr: 'Mon Profil', ar: 'ملفي الشخصي'}[lang]}</h2>
                </div>

                <form className="p-8 space-y-6" onSubmit={handleSaveProfile}>
                  {/* Profile Photo */}
                  <div className="space-y-4">
                    <label className="label-saas">📸 {{fr: 'Photo de profil', ar: 'صورة الملف'}[lang]}</label>
                    <div className="flex gap-6 items-start">
                      <div className="w-24 h-24 rounded-full overflow-hidden border-3 border-saas-primary-via shadow-lg flex items-center justify-center flex-shrink-0 bg-saas-bg">
                        {profileData.profilePhoto ? (
                          <img src={profileData.profilePhoto} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-4xl">👤</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleProfilePhotoUpload}
                            className="hidden"
                          />
                          <span className="btn-saas-primary px-6 py-3 inline-block cursor-pointer">
                            {{fr: 'Changer la photo', ar: 'تغيير الصورة'}[lang]}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <label className="label-saas">👤 {{fr: 'Nom complet', ar: 'الاسم الكامل'}[lang]}</label>
                    <input
                      type="text"
                      name="name"
                      value={profileData.name}
                      onChange={handleProfileChange}
                      className="input-saas"
                    />
                  </div>

                  {/* Un employé n'a pas de session Supabase : son mot de passe est
                      la seule preuve d'identité acceptée par la RPC de mise à jour. */}
                  {!isAdmin && (
                    <div className="space-y-2">
                      <label className="label-saas">🔑 {{fr: 'Mot de passe actuel', ar: 'كلمة المرور الحالية'}[lang]}</label>
                      <input
                        type="password"
                        value={profilePassword}
                        onChange={e => setProfilePassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="input-saas"
                      />
                      <p className="text-xs text-saas-text-muted">
                        {{fr: 'Requis pour confirmer les modifications de votre profil.', ar: 'مطلوب لتأكيد تعديلات ملفك الشخصي.'}[lang]}
                      </p>
                    </div>
                  )}

                  {/* Save Button */}
                  <div className="flex gap-3 pt-6 border-t border-saas-border">
                    <button
                      type="button"
                      onClick={() => { setProfileData(prev => ({ ...prev, name: user.name })); setProfilePassword(''); }}
                      disabled={savingProfile}
                      className="flex-1 py-3 px-4 rounded-lg font-bold text-sm bg-white border-2 border-saas-border hover:bg-saas-bg-light transition-colors text-saas-text-main disabled:opacity-50"
                    >
                      {{fr: 'Annuler', ar: 'إلغاء'}[lang]}
                    </button>
                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="flex-1 btn-saas-primary py-3 disabled:opacity-60"
                    >
                      {savingProfile
                        ? {fr: 'Enregistrement…', ar: 'جاري الحفظ…'}[lang]
                        : {fr: 'Enregistrer', ar: 'حفظ'}[lang]}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security Section */}
              <div className="bg-white rounded-[2rem] shadow-lg border border-saas-border overflow-hidden">
                <div className="p-6 border-b border-saas-border bg-linear-to-r from-red-500 via-red-600 to-red-700 text-white">
                  <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                    🛡️ {{fr: 'Informations de Connexion', ar: 'معلومات تسجيل الدخول'}[lang]}
                  </h2>
                </div>

                <form className="p-8 space-y-6" onSubmit={handleSaveSecurity}>
                  {/* Username */}
                  <div className="space-y-2">
                    <label className="label-saas">👤 {{fr: 'Nom d\'utilisateur', ar: 'اسم المستخدم'}[lang]}</label>
                    <input
                      type="text"
                      name="username"
                      value={securityData.username}
                      onChange={handleSecurityChange}
                      autoComplete="username"
                      className="input-saas"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <label className="label-saas">📧 {{fr: 'E-mail de récupération', ar: 'البريد الإلكتروني للاستعادة'}[lang]}</label>
                    <input
                      type="email"
                      name="email"
                      value={securityData.email}
                      onChange={handleSecurityChange}
                      autoComplete="email"
                      className="input-saas"
                    />
                  </div>

                  {/* Mot de passe actuel — exigé pour toute modification d'identifiant */}
                  <div className="space-y-2">
                    <label className="label-saas">🔑 {{fr: 'Mot de passe actuel', ar: 'كلمة المرور الحالية'}[lang]}</label>
                    <input
                      type="password"
                      name="currentPassword"
                      value={securityData.currentPassword}
                      onChange={handleSecurityChange}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="input-saas"
                    />
                    <p className="text-xs text-saas-text-muted">
                      {{fr: 'Requis pour changer l\'e-mail ou le mot de passe.', ar: 'مطلوب لتغيير البريد الإلكتروني أو كلمة المرور.'}[lang]}
                    </p>
                  </div>

                  {/* New Password */}
                  <div className="space-y-2">
                    <label className="label-saas">🔐 {{fr: 'Nouveau mot de passe', ar: 'كلمة المرور الجديدة'}[lang]}</label>
                    <input
                      type="password"
                      name="newPassword"
                      value={securityData.newPassword}
                      onChange={handleSecurityChange}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="input-saas"
                    />
                    <p className="text-xs text-saas-text-muted">
                      {{fr: 'Laissez vide pour conserver le mot de passe actuel (6 caractères minimum).', ar: 'اتركه فارغًا للاحتفاظ بكلمة المرور الحالية (6 أحرف على الأقل).'}[lang]}
                    </p>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <label className="label-saas">🔐 {{fr: 'Confirmer le mot de passe', ar: 'تأكيد كلمة المرور'}[lang]}</label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={securityData.confirmPassword}
                      onChange={handleSecurityChange}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="input-saas"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex gap-3 pt-6 border-t border-saas-border">
                    <button
                      type="button"
                      onClick={() => setSecurityData(prev => ({
                        ...prev,
                        email: user.email,
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      }))}
                      disabled={savingSecurity}
                      className="flex-1 py-3 px-4 rounded-lg font-bold text-sm bg-white border-2 border-saas-border hover:bg-saas-bg-light transition-colors text-saas-text-main disabled:opacity-50"
                    >
                      {{fr: 'Annuler', ar: 'إلغاء'}[lang]}
                    </button>
                    <button
                      type="submit"
                      disabled={savingSecurity}
                      className="flex-1 btn-saas-primary py-3 disabled:opacity-60"
                    >
                      {savingSecurity
                        ? {fr: 'Mise à jour…', ar: 'جاري التحديث…'}[lang]
                        : {fr: 'Mettre à jour', ar: 'تحديث'}[lang]}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {/* DATABASE TAB */}
          {activeTab === 'database' && (
            <motion.div
              key="database"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[2rem] shadow-lg border border-saas-border overflow-hidden">
                <div className="p-6 border-b border-saas-border bg-linear-to-r from-green-500 via-green-600 to-green-700 text-white">
                  <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
                    💾 {{fr: 'Gestion des données', ar: 'إدارة البيانات'}[lang]}
                  </h2>
                </div>

                <div className="p-8 space-y-6">
                  {/* Backup Section */}
                  <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-black text-green-700 text-lg flex items-center gap-2">
                          📤 {{fr: 'Sauvegarder', ar: 'قياس النسخ الاحتياطية'}[lang]}
                        </h3>
                        <p className="text-sm text-green-600 mt-1">
                          {{fr: 'Dernière sauvegarde : ', ar: 'آخر نسخة احتياطية : '}[lang]}<span className="font-bold">{lastBackup}</span>
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-green-700 mb-4">
                      {{fr: 'Téléchargez une copie complète de vos données au format JSON/SQL.', ar: 'قم بتنزيل نسخة كاملة من بياناتك بصيغة JSON / SQL.'}[lang]}
                    </p>
                    <button
                      onClick={handleExportDatabase}
                      className="btn-saas-primary py-3 px-6"
                    >
                      {{fr: 'Lancer l\'exportation', ar: 'ابدأ التصدير'}[lang]}
                    </button>
                  </div>

                  {/* Restore Section */}
                  <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-black text-blue-700 text-lg flex items-center gap-2">
                          📥 {{fr: 'Restaurer une sauvegarde', ar: 'استعادة نسخة احتياطية'}[lang]}
                        </h3>
                      </div>
                    </div>
                    <p className="text-sm text-blue-700 mb-4">
                      {{fr: 'Importez un fichier de sauvegarde pour restaurer vos informations.', ar: 'استيراد ملف نسخة احتياطية لاستعادة معلوماتك.'}[lang]}
                    </p>
                    <div className="flex gap-3">
                      <label className="flex-1">
                        <input
                          type="file"
                          accept=".json,.sql"
                          onChange={handleRestoreDatabase}
                          className="hidden"
                        />
                        <span className="btn-saas-primary py-3 px-6 inline-block cursor-pointer w-full text-center">
                          {{fr: 'Choisir un fichier', ar: 'اختر ملف'}[lang]}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
