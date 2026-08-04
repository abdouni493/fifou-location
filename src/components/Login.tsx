import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Lock, Eye, EyeOff, Globe } from 'lucide-react';
import { supabase } from '../supabase';
import { Language, UserRole, User } from '../types';
import { TRANSLATIONS } from '../constants';
import { DatabaseService } from '../services/DatabaseService';
import { sessionService } from '../utils/sessionService';
import { cacheWorkerPermissions } from '../utils/permissions';
import { BrandMark } from './BrandMark';

interface LoginProps {
  lang: Language;
  // now emit full user object once authenticated
  onLogin: (user: User) => void;
}

interface AgencyBranding {
  logo: string;
  navbarLogo: string;
  name: string;
}

export const Login: React.FC<LoginProps> = ({ lang, onLogin }) => {
  const t = TRANSLATIONS[lang];
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agencyBranding, setAgencyBranding] = useState<AgencyBranding>({
    logo: '',
    navbarLogo: '',
    name: 'AutoLocation'
  });

  useEffect(() => {
    const loadAgencyBranding = async () => {
      try {
        const settings = await DatabaseService.getWebsiteSettings();
        if (settings) {
          setAgencyBranding({
            logo: settings.logo || '',
            navbarLogo: settings.navbar_logo || '',
            name: settings.name || 'AutoLocation'
          });
        }
      } catch (err) {
        console.warn('Error loading agency branding:', err);
      }
    };
    
    loadAgencyBranding();
  }, []);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const timestamp = new Date().toLocaleTimeString();
    console.log(`\n[Login] ======= LOGIN ATTEMPT STARTED at ${timestamp} =======`);
    
    // Prevent double submissions
    if (isSubmitting) {
      console.log('[Login] Form already submitting, ignoring duplicate submission');
      return;
    }
    
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      // LOGIN FLOW ONLY
      if (!email.trim() || !password) {
        setErrorMessage(lang === 'fr'
          ? 'Veuillez remplir l\'email et le mot de passe.'
          : 'يرجى إدخال البريد الإلكتروني وكلمة المرور.');
        setIsSubmitting(false);
        return;
      }

      // Check if input is email or username
      const credential = email.trim();
      const isEmail = credential.includes('@');

      if (isEmail) {
        // Email-based login
        console.log('[Login] === EMAIL LOGIN ===');
        console.log('[Login] Attempting Supabase login with email...');

        const result = await supabase.auth.signInWithPassword({
          email: credential,
          password
        });

        if (result.error) {
          // Pas de compte Auth : ce peut être un employé d'avant la bascule,
          // on retombe alors sur le RPC employé plus bas.
          console.log('[Login] Supabase Auth failed:', result.error.message);
        } else if (result.data?.session) {
          const u = result.data.user;
          const role = (u.user_metadata?.role as UserRole) || 'admin';
          const name = (u.user_metadata?.username as string) || u.user_metadata?.full_name || u.email || '';
          
          console.log('[Login] === ADMIN LOGIN SUCCESSFUL ===');
          console.log('[Login] Admin authenticated:', { name, email: u.email, role });
          
          // Save session to database using new session service
          console.log('[Login] Saving session to database...');
          await sessionService.createSession(
            result.data.session.access_token,
            result.data.session.refresh_token,
            result.data.session.expires_at || Math.floor(Date.now() / 1000) + 3600,
            u.id,
            u.email || '',
            role,
            name
          );
          
          // CRITICAL: Clear all SDK session data to prevent auto-refresh
          console.log('[Login] Clearing SDK session data to prevent auto-refresh...');
          localStorage.removeItem('supabase.auth.token');
          sessionStorage.clear();
          
          // Clear form
          setEmail('');
          setPassword('');
          
          console.log('[Login] Calling onLogin callback...');
          onLogin({ name, email: u.email || '', role, avatar: '' });
          return;
        }
      }

      // Employé sans compte Auth : le RPC accepte aussi bien l'email que le
      // nom d'utilisateur, il couvre donc les deux formes de saisie.
      console.log('[Login] === WORKER LOGIN ===');
      console.log('[Login] Attempting worker login via RPC...');

      const { data: loginResult, error: rpcError } = await supabase.rpc('login_worker', {
        p_email_or_username: credential,
        p_password: password
      });

      if (rpcError || !loginResult?.success) {
        console.log('[Login] Worker login failed:', rpcError?.message || loginResult?.error);
        setErrorMessage(lang === 'fr'
          ? 'Email ou mot de passe incorrect.'
          : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.');
        setIsSubmitting(false);
        return;
      }

      // Worker RPC login successful
      const worker = loginResult.worker;
      const workerRole = (worker.type as UserRole) || 'worker';

      console.log('[Login] === WORKER LOGIN SUCCESSFUL ===');
      console.log('[Login] Worker authenticated:', { name: worker.full_name, email: worker.email, role: workerRole });

      // Sans session Supabase, la lecture de sa ligne `workers` serait
      // refusée par RLS : on met ses droits de côté dès maintenant pour
      // que sa barre latérale soit correcte malgré tout.
      if (worker.email) {
        cacheWorkerPermissions(
          worker.email,
          Array.isArray(worker.permissions) ? worker.permissions : [],
        );
      }

      // Save worker session to database
      const sessionResult = await sessionService.createSession(
        `worker_token_${Date.now()}`,
        undefined,
        Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        worker.id || `worker_${Date.now()}`,
        worker.email || '',
        workerRole,
        worker.full_name
      );

      console.log('[Login] Session saved:', !!sessionResult);

      // Clear form
      setEmail('');
      setPassword('');

      console.log('[Login] Calling onLogin callback...');
      onLogin({
        name: worker.full_name,
        email: worker.email || '',
        role: workerRole,
        avatar: worker.profile_photo || ''
      });
    } catch (error) {
      console.log('[Login] === UNEXPECTED ERROR ===');
      console.log('[Login] Error:', error);
      setErrorMessage(lang === 'fr' 
        ? 'Une erreur est survenue lors de la connexion.' 
        : 'حدث خطأ أثناء تسجيل الدخول.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 sm:p-6 relative overflow-hidden fx-safe-b fx-safe-t">
      {/* Décor : deux halos rouges qui dérivent lentement sur le carbone.
          `pointer-events-none` + z-0 pour ne jamais gêner la saisie. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
        <div className="absolute inset-0 vel-grid-bg opacity-40" />
        <motion.div
          className="absolute -top-40 -left-32 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(200,16,46,0.42), transparent 68%)' }}
          animate={{ x: [0, 90, 0], y: [0, 60, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute -bottom-48 -right-24 w-[32rem] h-[32rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(116,8,26,0.4), transparent 68%)' }}
          animate={{ x: [0, -70, 0], y: [0, -50, 0] }}
          transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Main login card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative z-10"
      >
        <div
          className="rounded-2xl p-6 sm:p-9 space-y-7 sm:space-y-8"
          style={{
            backgroundImage:
              'radial-gradient(90% 120% at 100% 0%, rgba(200,16,46,0.16), transparent 60%), var(--fx-grad-surface)',
            border: '1px solid var(--fx-line-strong)',
            boxShadow: 'var(--fx-edge-red), var(--fx-shadow-lg), 0 0 70px -24px rgba(200,16,46,0.5)',
          }}
        >

          {/* Agency Logo & Name Section */}
          <motion.div 
            className="text-center space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
          >
            {/* Logo — l'écusson détouré. Le wordmark, lui, est un bloc noir 3:2 :
                enfermé dans ce carré de 80 px il ne donnait qu'une barre noire. */}
            {(agencyBranding.navbarLogo || agencyBranding.logo) && (
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.3, duration: 0.8, type: "spring", stiffness: 100 }}
                className="flex justify-center mb-2"
              >
                <BrandMark
                  logo={agencyBranding.navbarLogo}
                  fallbackLogo={agencyBranding.logo}
                  name={agencyBranding.name}
                  size={88}
                  className="drop-shadow-lg"
                />
              </motion.div>
            )}

            {/* Agency Name - First 3 words only */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase fx-chrome-text break-words">
                {agencyBranding.name.split(' ').slice(0, 3).join(' ')}
              </h1>
              <motion.p
                className="font-black uppercase tracking-[0.3em] text-[10px] sm:text-[11px] mt-3"
                style={{ color: 'var(--fx-red-300)' }}
                animate={{ opacity: [0.65, 1, 0.65] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {t.login}
              </motion.p>
            </motion.div>
          </motion.div>

          {/* Form Section */}
          <motion.form 
            className="space-y-8" 
            onSubmit={handleSubmit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <div className="space-y-6">
              {/* Email/Username field */}
              <motion.div 
                className="space-y-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
              >
                <label className="label-saas">
                  {lang === 'fr' ? 'Email ou Nom d\'utilisateur' : 'البريد الإلكتروني أو اسم المستخدم'}
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-saas-text-muted group-focus-within:text-saas-primary-via transition-colors" size={18} />
                  <input 
                    type="text" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-saas pl-12"
                    placeholder="john.doe ou john@email.com"
                  />
                </div>
              </motion.div>

              {/* Password field */}
              <motion.div 
                className="space-y-2"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <label className="label-saas">{t.password}</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-saas-text-muted group-focus-within:text-saas-primary-via transition-colors" size={18} />
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-saas pl-12 pr-12"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-saas-text-muted hover:text-saas-primary-via transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 text-sm font-medium"
                style={{
                  color: 'var(--fx-red-200)',
                  backgroundImage: 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.05))',
                  border: '1px solid var(--fx-line-red-hi)',
                }}
              >
                ⚠️ {errorMessage}
              </motion.div>
            )}

            {/* Submit Button */}
            <motion.button
              type="submit"
              disabled={isSubmitting}
              whileHover={{ scale: 1.02, boxShadow: "0 10px 30px rgba(30, 58, 138, 0.2)" }}
              whileTap={{ scale: 0.98 }}
              className="btn-saas-primary w-full text-sm py-4"
            >
              {isSubmitting ? (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {t.login}...
                </motion.span>
              ) : (
                t.login
              )}
            </motion.button>
          </motion.form>

          {/* Voir le site public sans se connecter */}
          <motion.button
            type="button"
            onClick={() => navigate('/website')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.8 }}
            whileTap={{ scale: 0.98 }}
            className="fx-btn fx-btn-ghost w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm"
          >
            <Globe size={17} />
            {lang === 'fr' ? 'Voir le site web' : 'مشاهدة الموقع الإلكتروني'}
          </motion.button>

          {/* Filet lumineux : la seule décoration animée de la carte */}
          <motion.div
            className="h-0.5 rounded-full"
            style={{ backgroundImage: 'var(--fx-grad-red)' }}
            animate={{ scaleX: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </div>
  );
};
