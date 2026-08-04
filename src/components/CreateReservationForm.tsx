import React, { useState, useRef, useEffect } from 'react';
import { Language, ReservationDetails, ReservationWizardData, Client, Car, VehicleInspection, Payment, AdditionalService, ProtectionAssurance } from '../types';
import { getDeliveryFeePayer } from '../utils/deliveryFee';
import {
  Currency, DEFAULT_EUR_RATE, carUnitPrices, formatMoney, fromDzd, toDzd,
  roundIn, safeRate, currencySymbol, impliedEurRate,
} from '../utils/currency';
import { DeliveryFeeField } from './DeliveryFeeField';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Calendar, Clock, MapPin, Car as CarIcon, User, CreditCard, CheckCircle, Plus, Search, X, Camera, Fuel, AlertTriangle, Check, Upload, PenTool } from 'lucide-react';
import { AGENCIES, CAR_IMAGES } from '../constants';
import { DatabaseService } from '../services/DatabaseService';
import { ReservationsService } from '../services/ReservationsService';
import { uploadInspectionImage } from '../services/uploadInspectionImage';
import { ClientModal } from './ClientModal';
import { supabase } from '../supabase';

// Signature Pad Component
const SignaturePad: React.FC<{
  lang: Language;
  onSignatureChange: (signature: string) => void;
  initialSignature?: string;
}> = ({ lang, onSignatureChange, initialSignature }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureChange(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange('');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Set drawing properties
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If there is an initial signature, draw it onto the canvas
    if (initialSignature) {
      const img = new Image();
      // allow loading from storage URL (CORS) if possible
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasSignature(true);
        onSignatureChange(initialSignature);
      };
      img.src = initialSignature;
    } else {
      // clear if no initial signature
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
    }
  }, [initialSignature]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="w-full aspect-square border border-purple-300 rounded-lg cursor-crosshair bg-white"
          style={{ touchAction: 'none' }}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-purple-400">
              <PenTool className="w-4 h-4 mx-auto mb-1" />
              <p className="text-xs font-bold">
                {lang === 'fr' ? 'Signez ici' : 'وقع هنا'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs text-purple-700 font-bold">
          {lang === 'fr' ? 'Signature numérique' : 'التوقيع الرقمي'}
        </p>
        <button
          onClick={clearSignature}
          className="text-red-600 hover:text-red-800 font-bold text-xs underline"
        >
          {lang === 'fr' ? 'Effacer' : 'مسح'}
        </button>
      </div>
    </div>
  );
};

interface CreateReservationFormProps {
  lang: Language;
  onBack: () => void;
  inspectionMode?: boolean;
  initialData?: Partial<ReservationDetails>;
  user?: any;
}

export const CreateReservationForm: React.FC<CreateReservationFormProps> = ({ lang, onBack, inspectionMode = false, initialData, user }) => {
  const [currentStep, setCurrentStep] = useState(inspectionMode ? 3 : 1);
  const [agencies, setAgencies] = useState<any[]>([]);
  const [isLoadingAgencies, setIsLoadingAgencies] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load agencies from database on component mount
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        setIsLoadingAgencies(true);
        const data = await DatabaseService.getAgencies();
        setAgencies(data || []);
      } catch (err) {
        console.error('Error loading agencies:', err);
        // Fallback to constants if database fails
        setAgencies(AGENCIES);
      } finally {
        setIsLoadingAgencies(false);
      }
    };

    loadAgencies();
  }, []);

  // When in inspection mode with initialData, map additionalServices and other data to step5
  useEffect(() => {
    if (inspectionMode && initialData) {
      const services = (initialData as any).additionalServices;
      const updates: any = {};
      // Auto-select services
      if (services && services.length > 0 && !formData.step5?.additionalServices?.length) {
        updates.step5 = {
          additionalServices: services
        };
      }
      // Auto-select locations from step1
      if (!formData.step1?.departureAgencyId && !formData.step1?.departureLocation) {
        // First try to get from step1, then try direct properties
        const departureLocation = (initialData as any).step1?.departureLocation || (initialData as any).departureLocation || '';
        const returnLocation = (initialData as any).step1?.returnLocation || (initialData as any).returnLocation || departureLocation;
        const departureDate = (initialData as any).step1?.departureDate || (initialData as any).departureDate || formData.step1?.departureDate;
        const returnDate = (initialData as any).step1?.returnDate || (initialData as any).returnDate || formData.step1?.returnDate;
        const departureTime = (initialData as any).step1?.departureTime || (initialData as any).departureTime || '';
        const returnTime = (initialData as any).step1?.returnTime || (initialData as any).returnTime || '';
        const departureAgencyId = (initialData as any).departure_agency_id || (initialData as any).departureAgencyId
          || (initialData as any).step1?.departureAgencyId || (initialData as any).step1?.departureAgency || '';
        const returnAgencyId = (initialData as any).return_agency_id || (initialData as any).returnAgencyId
          || (initialData as any).step1?.returnAgencyId || (initialData as any).step1?.returnAgency || departureAgencyId;

        updates.step1 = {
          ...(formData.step1 || {}),
          departureLocation,
          returnLocation,
          departureDate,
          returnDate,
          departureTime,
          returnTime,
          departureAgencyId,
          returnAgencyId,
          departureAgency: (initialData as any).step1?.departureAgency,
          returnAgency: (initialData as any).step1?.returnAgency
        };
      }
      // Auto-select car
      if (!formData.step2?.selectedCar && (initialData as any).car) {
        updates.step2 = {
          selectedCar: (initialData as any).car
        };
      }
      // Auto-select client
      if (!formData.step4?.selectedClient && (initialData as any).client) {
        updates.step4 = {
          selectedClient: (initialData as any).client
        };
      }
      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({
          ...prev,
          ...updates
        }));
      }
    }
  }, [inspectionMode, initialData]);

  const [formData, setFormData] = useState<ReservationWizardData>(() => ({
    step1: {
      departureDate: '',
      departureTime: '',
      returnDate: '',
      returnTime: '',
      departureAgencyId: '',
      returnAgencyId: '',
      departureLocation: '',
      returnLocation: ''
    },
    step2: { selectedCar: null },
    step3: { departureInspection: null },
    step4: { selectedClient: null },
    step5: { additionalServices: [] },
    step6: {
      basePrice: 0,
      additionalFees: 0,
      deliveryFee: 0,
      totalPrice: 0,
      advancePayment: 0,
      remainingPayment: 0,
      deposit: 0
    },
    ...(initialData as unknown as Partial<ReservationWizardData> | undefined),
  }));

  /**
   * L'inspection de départ décide du statut de la réservation.
   *
   * La check-list est pré-remplie avec TOUS les points de contrôle décochés dès
   * que la liste maître est chargée : sa simple présence ne prouve donc rien.
   * Le seul signal fiable qu'une inspection a réellement eu lieu est qu'au moins
   * un point ait été coché — d'où `some(checked)` plutôt que `length > 0`.
   *
   *   check-list touchée  -> 'confirmed' (véhicule inspecté, prêt à être activé)
   *   check-list vierge   -> 'pending'   (réservation posée, inspection à faire)
   */
  const isDepartureChecklistTouched = (formData.step3?.departureInspection?.inspectionItems ?? [])
    .some((item: any) => item?.checked);
  const resolvedStatus: 'pending' | 'confirmed' = isDepartureChecklistTouched ? 'confirmed' : 'pending';

  const totalSteps = 6;
  const steps = [
    { id: 1, title: lang === 'fr' ? 'Dates & Lieux' : 'التواريخ والأماكن', icon: '📅' },
    { id: 2, title: lang === 'fr' ? 'Sélection Véhicule' : 'اختيار المركبة', icon: '🚗' },
    { id: 3, title: lang === 'fr' ? 'Inspection Départ' : 'فحص المغادرة', icon: '🔍' },
    { id: 4, title: lang === 'fr' ? 'Client' : 'العميل', icon: '👤' },
    { id: 5, title: lang === 'fr' ? 'Services Supplémentaires' : 'الخدمات الإضافية', icon: '🛠️' },
    { id: 6, title: lang === 'fr' ? 'Tarification Finale' : 'التسعير النهائي', icon: '💰' }
  ];

  /**
   * Le mode inspection n'est pas un assistant : c'est un écran unique.
   *
   * La réservation existe déjà (dates, véhicule, client, tarif ont été fixés à
   * la création) ; seule la check-list de départ reste à saisir. Rejouer les
   * étapes services/tarification n'apporterait rien et laisserait l'utilisateur
   * réécrire des montants déjà encaissés. Les deux gardes ci-dessous verrouillent
   * la navigation même si un bouton « Suivant » réapparaissait un jour.
   */
  const handleNext = () => {
    if (inspectionMode) return;
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (inspectionMode) return;
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    try {
      // Les agences sont résolues par ID — le libellé affiché n'est qu'un texte.
      const departureAgency = agencies.find(a => a.id === formData.step1?.departureAgencyId);
      const returnAgency = agencies.find(a => a.id === formData.step1?.returnAgencyId) || departureAgency;

      // Skip agency validation if inspectionMode (for both pending and accepted reservations)
      if (!(inspectionMode && initialData)) {
        if (!departureAgency || !returnAgency) {
          alert(lang === 'fr' ? 'Veuillez sélectionner une agence de départ.' : 'يرجى اختيار وكالة المغادرة.');
          return;
        }

        // Sans les deux dates, totalDays vaudrait NaN et l'insert échouerait sans message clair.
        if (!formData.step1?.departureDate || !formData.step1?.returnDate) {
          alert(lang === 'fr'
            ? 'Veuillez renseigner la date de départ et la date de retour.'
            : 'يرجى إدخال تاريخ المغادرة وتاريخ العودة.');
          return;
        }
        if (new Date(formData.step1.returnDate) < new Date(formData.step1.departureDate)) {
          alert(lang === 'fr'
            ? 'La date de retour doit être postérieure ou égale à la date de départ.'
            : 'يجب أن يكون تاريخ العودة بعد تاريخ المغادرة أو مساويًا له.');
          return;
        }
      }

      // Une location commencée et rendue le même jour compte pour 1 jour, jamais 0.
      const rawDays = Math.ceil(
        (new Date(formData.step1?.returnDate || '').getTime() - new Date(formData.step1?.departureDate || '').getTime())
        / (1000 * 60 * 60 * 24)
      );
      const totalDays = Number.isFinite(rawDays) ? Math.max(1, rawDays) : 1;

      // Calculate total price
      const step6 = formData.step6 || {};
      const totalPrice = step6.totalPrice || 0;
      const advancePayment = step6.advancePayment || 0;
      const deliveryFee = step6.deliveryFee || 0;
      const remainingPayment = Math.max(0, totalPrice - advancePayment);

      // Create reservation using ReservationsService
      // Skip client/car validation if inspectionMode (for both pending and accepted reservations)
      if (!(inspectionMode && initialData)) {
        if (!formData.step4?.selectedClient?.id || !formData.step2?.selectedCar?.id || !departureAgency?.id || !returnAgency?.id) {
          alert(lang === 'fr' ? 'Veuillez sélectionner un client, un véhicule et des agences valides.' : 'يرجى اختيار عميل ومركبة ووكالات صحيحة.');
          return;
        }
      }
      let clientId = formData.step4?.selectedClient?.id || '';
      let carId = formData.step2?.selectedCar?.id || '';
      let departureAgencyId = departureAgency?.id || '';
      let returnAgencyId = returnAgency?.id || '';
      if (inspectionMode && initialData) {
        clientId = (initialData as any)?.client?.id || '';
        carId = (initialData as any)?.car?.id || '';
        departureAgencyId = (initialData as any)?.departure_agency_id || (initialData as any)?.departureAgencyId || (initialData as any)?.step1?.departureAgency || '';
        returnAgencyId = (initialData as any)?.return_agency_id || (initialData as any)?.returnAgencyId || (initialData as any)?.step1?.returnAgency || '';
        // Block if any required UUID is missing
        if (!clientId || !carId || !departureAgencyId || !returnAgencyId) {
          alert(lang === 'fr' ? "Impossible de créer la réservation: données manquantes (client, véhicule ou agence)." : "لا يمكن إنشاء الحجز: بيانات مفقودة (عميل أو مركبة أو وكالة).");
          return;
        }
      }
      
      // Use appropriate function based on mode
      let reservationId: string;
      if (inspectionMode && initialData) {
        // Écran d'inspection : la réservation est déjà tarifée. Comme les étapes
        // services/tarification ne sont plus affichées, `formData.step6` garde ses
        // valeurs par défaut (des zéros) — les persister remettrait à plat le prix,
        // l'avance et la devise de règlement. On n'écrit donc que le statut, qui
        // passe à 'confirmed' dès que la check-list de départ est remplie.
        reservationId = (initialData as any).id;
        await ReservationsService.updateReservation(reservationId, {
          status: resolvedStatus,
        });
      } else {
        // Déclaré hors du `try` : le `catch` ci-dessous le référence pour le log.
        // Le laisser à l'intérieur provoquait un ReferenceError qui masquait la
        // vraie erreur d'insert.
        let workerFullName: string | null = null;

        // Create new reservation
        try {
          // Fetch worker's full name from database using email
          if (user?.email) {
            try {
              console.log('🔍 Fetching worker by email:', user.email);
              
              const { data: workerData, error: workerError } = await supabase
                .from('workers')
                .select('full_name, email, username')
                .eq('email', user.email)
                .single();
              
              console.log('📦 Worker query result:', {
                data: workerData,
                error: workerError?.message
              });
              
              if (!workerError && workerData) {
                workerFullName = workerData.full_name;
                console.log('✅ Successfully fetched worker full_name:', workerFullName);
              } else {
                console.log('⚠️ Could not fetch worker:', workerError?.message);
                // Don't fall back to user.name (which might be email)
              }
            } catch (err: any) {
              console.error('❌ Error fetching worker:', err);
            }
          }
          
          console.log('Creating reservation with creator info:', {
            userEmail: user?.email,
            workerFullName: workerFullName
          });
          
          const result = await ReservationsService.createReservation({
            clientId,
            carId,
            departureDate: formData.step1?.departureDate || '',
            departureTime: formData.step1?.departureTime || '',
            departureAgencyId,
            returnDate: formData.step1?.returnDate || '',
            returnTime: formData.step1?.returnTime || '',
            returnAgencyId,
            pricePerDay: formData.step2?.selectedCar?.priceDay || 0,
            priceWeek: formData.step2?.selectedCar?.priceWeek || 0,
            priceMonth: formData.step2?.selectedCar?.priceMonth || 0,
            totalDays: totalDays,
            totalPrice: totalPrice,
            deposit: formData.step2?.selectedCar?.deposit || 0,
            advancePayment: advancePayment,
            remainingPayment: remainingPayment,
            // 'confirmed' si la check-list d'inspection a été remplie, sinon 'pending'.
            status: resolvedStatus,
            notes: formData.step6?.notes || '',
            // Caution and Assurance fields
            cautionAmountDzd: (formData.step6 as any)?.caution_amount_dzd || formData.step2?.selectedCar?.deposit || 0,
            cautionCurrency: (formData.step6 as any)?.cautionCurrency || 'DZD',
            euroRate: (formData.step6 as any)?.euroRate || DEFAULT_EUR_RATE,
            // Devise de règlement + montants dans cette devise (les colonnes DZD restent la référence).
            paymentCurrency: (formData.step6 as any)?.paymentCurrency || 'DZD',
            totalPriceEur: (formData.step6 as any)?.totalPriceEur ?? null,
            advancePaymentEur: (formData.step6 as any)?.advancePaymentEur ?? null,
            remainingPaymentEur: (formData.step6 as any)?.remainingPaymentEur ?? null,
            assuranceEnabled: (formData.step6 as any)?.assuranceEnabled || false,
            assurancePercentage: (formData.step6 as any)?.assuranceEnabled
              ? (formData.step6 as any)?.assurancePercentage !== ''
                ? Number((formData.step6 as any)?.assurancePercentage)
                : 0
              : 0,
            // Assurance de protection sélectionnée (snapshot nom + prix/jour)
            protectionAssuranceId: formData.protectionAssurance?.id || null,
            protectionAssuranceName: formData.protectionAssurance?.name || null,
            protectionAssurancePrice: formData.protectionAssurance?.pricePerDay ?? null,
            // Frais de livraison — le payeur est déduit de totalDays par un trigger DB.
            deliveryFee,
            // Creator info - Only save name since User object doesn't have ID
            createdBy: undefined,  // No user ID available in current auth system
            createdByName: workerFullName || undefined,
          });

          reservationId = result.id;
        } catch (creationError: any) {
          console.error('❌ Error creating reservation with creator info:', {
            error: creationError?.message,
            details: creationError,
            creatorData: {
              createdBy: null,
              createdByName: workerFullName
            }
          });
          throw creationError;
        }

        // L'avance doit exister comme paiement : sinon l'encaissé calculé par les
        // vues (calcPaid) diverge du champ `advance_payment` de la réservation.
        if (advancePayment > 0) {
          try {
            await ReservationsService.addPayment({
              reservationId,
              amount: advancePayment,
              paymentMethod: 'cash',
              date: new Date().toISOString().split('T')[0],
              note: lang === 'fr' ? 'Avance à la création' : 'دفعة أولى عند الإنشاء',
            });
          } catch (paymentError) {
            console.error('Error recording advance payment:', paymentError);
          }
        }
      }

      // Save selected services. En mode inspection, `step5` n'est qu'une recopie des
      // services déjà rattachés à la réservation : les réécrire ne ferait que rejouer
      // un delete/insert inutile.
      const selectedServices = formData.step5?.additionalServices || [];
      if (!inspectionMode && selectedServices.length > 0) {
        await ReservationsService.updateReservationServices(reservationId, selectedServices);
      }

      // Save departure inspection if present
      const inspection = formData.step3?.departureInspection;
      if (inspection) {
        try {
          // Determine agency_id: prefer explicit agency id from step1, else fallback to first agency
          const agencyId = formData.step1?.departureAgencyId || formData.step1?.departureAgency || (agencies && agencies[0]?.id) || '';

          // Check if a departure inspection already exists for this reservation
          const existingDeparture = formData.departureInspection;
          if (existingDeparture && existingDeparture.id) {
            // Update existing inspection
            await DatabaseService.updateVehicleInspection(existingDeparture.id, {
              mileage: inspection.mileage || 0,
              fuel_level: inspection.fuelLevel || 'full',
              agency_id: agencyId,
              exterior_front_photo: inspection.exteriorPhotos?.[0] || null,
              exterior_rear_photo: inspection.exteriorPhotos?.[1] || null,
              interior_photo: inspection.interiorPhotos?.[0] || null,
              other_photos: inspection.other_photos || inspection.otherPhotos || [],
              client_signature: inspection.signature || inspection.client_signature || null,
              notes: inspection.notes || null,
              date: inspection.date || new Date().toISOString().split('T')[0],
              time: inspection.time || new Date().toTimeString().split(' ')[0]
            });

            // Save checklist responses for ALL items (store true/false)
            const responses = (inspection.inspectionItems || []).map((it: any) => ({
              inspection_id: existingDeparture.id,
              checklist_item_id: it.id,
              status: !!it.checked,
              note: it.note || null
            }));

            if (responses.length > 0) {
              await DatabaseService.upsertInspectionResponses(responses);
            }

            // Update car mileage
            if (inspection.mileage && inspection.mileage > 0) {
              await DatabaseService.updateCar(formData.step2.selectedCar.id, {
                mileage: inspection.mileage
              });
            }
          } else {
            // Create new inspection if none exists
            const createdInspection = await DatabaseService.createVehicleInspection({
              reservation_id: reservationId,
              type: 'departure',
              mileage: inspection.mileage || 0,
              fuel_level: inspection.fuelLevel || 'full',
              agency_id: agencyId,
              exterior_front_photo: inspection.exteriorPhotos?.[0] || null,
              exterior_rear_photo: inspection.exteriorPhotos?.[1] || null,
              interior_photo: inspection.interiorPhotos?.[0] || null,
              other_photos: inspection.other_photos || inspection.otherPhotos || [],
              client_signature: inspection.signature || inspection.client_signature || null,
              notes: inspection.notes || null,
              date: inspection.date || new Date().toISOString().split('T')[0],
              time: inspection.time || new Date().toTimeString().split(' ')[0]
            });

            // Save checklist responses for ALL items (store true/false)
            const responses = (inspection.inspectionItems || []).map((it: any) => ({
              inspection_id: createdInspection.id,
              checklist_item_id: it.id,
              status: !!it.checked,
              note: it.note || null
            }));

            if (responses.length > 0) {
              await DatabaseService.upsertInspectionResponses(responses);
            }

            // Update car mileage
            if (inspection.mileage && inspection.mileage > 0) {
              await DatabaseService.updateCar(formData.step2.selectedCar.id, {
                mileage: inspection.mileage
              });
            }
          }
        } catch (err) {
          console.error('Error saving inspection:', err);
        }
      }

      // Confirmation visible avant de rendre la main au planificateur (qui recharge la liste).
      // Le message annonce le statut réellement enregistré, pour que l'utilisateur
      // comprenne pourquoi la réservation apparaît « En attente » plutôt que « Confirmée ».
      const savedAsConfirmed = resolvedStatus === 'confirmed';
      setSuccessMessage(
        inspectionMode && initialData
          ? savedAsConfirmed
            ? (lang === 'fr' ? '✅ Réservation confirmée avec succès' : '✅ تم تأكيد الحجز بنجاح')
            : (lang === 'fr' ? '⏳ Réservation enregistrée en attente (inspection non remplie)' : '⏳ تم حفظ الحجز قيد الانتظار (لم يتم ملء الفحص)')
          : savedAsConfirmed
            ? (lang === 'fr' ? '✅ Réservation créée et confirmée' : '✅ تم إنشاء الحجز وتأكيده')
            : (lang === 'fr' ? '⏳ Réservation créée en attente (inspection non remplie)' : '⏳ تم إنشاء الحجز قيد الانتظار (لم يتم ملء الفحص)')
      );
      setTimeout(onBack, 1200);
    } catch (err: any) {
      console.error('❌ Error ' + (inspectionMode && initialData ? 'updating' : 'creating') + ' reservation:', {
        message: err?.message,
        error: err,
        stack: err?.stack
      });
      alert(lang === 'fr' ? `Erreur: ${err.message}` : `خطأ: ${err.message}`);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setFormData(prev => ({
          ...prev,
          step4: {
            ...prev.step4!,
            [field]: result
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-8">
      {/* Toast de succès — affiché juste avant le retour au planificateur */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            role="status"
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-green-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl font-bold text-sm"
          >
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-white hover:text-blue-200 font-bold"
          >
            <ArrowLeft className="w-5 h-5" />
            {lang === 'fr' ? 'Retour' : 'العودة'}
          </button>
          <div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">
              {inspectionMode
                ? `🔍 ${lang === 'fr' ? 'Inspection de Départ' : 'فحص المغادرة'}`
                : `➕ ${lang === 'fr' ? 'Nouvelle Réservation' : 'حجز جديد'}`}
            </h2>
            <p className="text-white font-bold uppercase text-[10px] tracking-widest">
              {inspectionMode
                ? (lang === 'fr'
                    ? 'Remplissez la check-list puis enregistrez pour confirmer'
                    : 'املأ قائمة الفحص ثم احفظ للتأكيد')
                : `${lang === 'fr' ? 'Étape' : 'الخطوة'} ${currentStep} ${lang === 'fr' ? 'sur' : 'من'} 6`}
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar — sans objet en mode inspection : il n'y a qu'un seul écran. */}
      {!inspectionMode && (
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step) => (
              <div key={step.id} className="flex flex-col items-center flex-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg mb-2 transition-colors ${
                  step.id < currentStep ? 'bg-green-500 text-white' :
                  step.id === currentStep ? 'bg-blue-500 text-white' :
                  'bg-slate-200 text-slate-500'
                }`}>
                  {step.id < currentStep ? <CheckCircle className="w-6 h-6" /> : step.icon}
                </div>
                <p className={`text-xs font-bold text-center ${
                  step.id <= currentStep ? 'text-slate-900' : 'text-slate-500'
                }`}>
                  {step.title}
                </p>
              </div>
            ))}
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(currentStep / totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-200"
        >
          <div className="p-8">
            {currentStep === 1 && <Step1DatesLocations lang={lang} formData={formData} setFormData={setFormData} agencies={agencies} isLoadingAgencies={isLoadingAgencies} inspectionMode={inspectionMode} initialData={initialData} />}
            {currentStep === 2 && <Step2VehicleSelection lang={lang} formData={formData} setFormData={setFormData} />}
            {currentStep === 3 && <Step3DepartureInspection lang={lang} formData={formData} setFormData={setFormData} />}
            {currentStep === 4 && <Step4ClientSelection lang={lang} formData={formData} setFormData={setFormData} />}
            {currentStep === 5 && <Step5AdditionalServices lang={lang} formData={formData} setFormData={setFormData} />}
            {currentStep === 6 && <Step6FinalPricing lang={lang} formData={formData} setFormData={setFormData} inspectionMode={inspectionMode} initialData={initialData} agencies={agencies} />}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Statut résultant — annoncé avant la soumission pour éviter la surprise. */}
      {(inspectionMode || currentStep === totalSteps) && (
        <div
          className={`rounded-2xl p-5 border-2 ${
            resolvedStatus === 'confirmed'
              ? 'bg-green-50 border-green-300'
              : 'bg-amber-50 border-amber-300'
          }`}
        >
          <p className={`font-black text-sm ${resolvedStatus === 'confirmed' ? 'text-green-900' : 'text-amber-900'}`}>
            {resolvedStatus === 'confirmed'
              ? (lang === 'fr' ? '✅ Statut : Confirmée' : '✅ الحالة: مؤكد')
              : (lang === 'fr' ? '⏳ Statut : En attente' : '⏳ الحالة: قيد الانتظار')}
          </p>
          <p className={`text-xs font-bold mt-1 ${resolvedStatus === 'confirmed' ? 'text-green-700' : 'text-amber-700'}`}>
            {resolvedStatus === 'confirmed'
              ? (lang === 'fr'
                  ? 'La check-list d\'inspection de départ a été remplie : la réservation sera enregistrée comme confirmée.'
                  : 'تم ملء قائمة فحص المغادرة: سيتم حفظ الحجز كمؤكد.')
              : (lang === 'fr'
                  ? 'Cochez au moins un point de la check-list d\'inspection pour pouvoir enregistrer : la réservation restera en attente jusque-là.'
                  : 'حدد عنصرًا واحدًا على الأقل من قائمة الفحص لتتمكن من الحفظ: سيبقى الحجز قيد الانتظار حتى ذلك الحين.')}
          </p>
        </div>
      )}

      {/* Navigation Buttons */}
      {inspectionMode ? (
        // Écran unique : pas de « Suivant ». Enregistrer fait passer la réservation
        // en 'confirmed', d'où le verrou tant qu'aucun point n'est coché.
        <div className="flex justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold bg-slate-600 hover:bg-slate-700 text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {lang === 'fr' ? 'Annuler' : 'إلغاء'}
          </button>

          <button
            onClick={handleSubmit}
            disabled={!isDepartureChecklistTouched}
            title={
              isDepartureChecklistTouched
                ? undefined
                : (lang === 'fr'
                    ? 'Cochez au moins un point de la check-list pour enregistrer l\'inspection.'
                    : 'حدد عنصرًا واحدًا على الأقل من قائمة الفحص لحفظ الفحص.')
            }
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-colors ${
              isDepartureChecklistTouched
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            ✅ {lang === 'fr' ? 'Enregistrer et confirmer' : 'حفظ وتأكيد'}
          </button>
        </div>
      ) : (
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-colors ${
              currentStep === 1
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-slate-600 hover:bg-slate-700 text-white'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            {lang === 'fr' ? 'Précédent' : 'السابق'}
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              className="btn-saas-primary"
            >
              {lang === 'fr' ? 'Suivant' : 'التالي'}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="btn-saas-primary flex items-center gap-2"
            >
              ✅ {lang === 'fr' ? 'Créer Réservation' : 'إنشاء الحجز'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Step 1: Dates & Locations
export const Step1DatesLocations: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
  agencies: any[];
  isLoadingAgencies: boolean;
  inspectionMode?: boolean;
  initialData?: Partial<ReservationDetails>;
}> = ({ lang, formData, setFormData, agencies, isLoadingAgencies, inspectionMode = false, initialData }) => {
  const [showReturnLocation, setShowReturnLocation] = useState(false);

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-black text-slate-900">
        📅 {lang === 'fr' ? 'Dates et Lieux de Location' : 'تواريخ وأماكن التأجير'}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Departure */}
        <div className="space-y-4">
          <h4 className="text-lg font-black text-green-700 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {lang === 'fr' ? 'Départ' : 'المغادرة'}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-900 mb-2">
                📅 {lang === 'fr' ? 'Date' : 'التاريخ'}
              </label>
              <input
                type="date"
                value={formData.step1?.departureDate || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  step1: { ...prev.step1!, departureDate: e.target.value }
                }))}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-900 mb-2">
                🕐 {lang === 'fr' ? 'Heure' : 'الوقت'}
              </label>
              <input
                type="time"
                value={formData.step1?.departureTime || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  step1: { ...prev.step1!, departureTime: e.target.value }
                }))}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block font-bold text-slate-900 mb-2">
              📍 {lang === 'fr' ? 'Lieu de Prise en Charge' : 'مكان الاستلام'}
            </label>
            {inspectionMode && initialData && initialData.status === 'accepted' ? (
              <div className="w-full p-3 border border-slate-200 rounded-lg bg-slate-100 text-lg font-bold text-slate-900">
                {(() => {
                  if (!agencies || agencies.length === 0) {
                    return 'Erreur: agences non chargées.';
                  }
                  // La réservation vient de la DB : ses champs sont en snake_case.
                  const seed = initialData as any;
                  const selectedClient = formData.step4?.selectedClient as any;
                  let agencyId = seed.departure_agency_id || seed.departureAgencyId;
                  // Only fallback if agencyId is truly missing
                  if (!agencyId) {
                    if (seed.client && (seed.client.agencyId || seed.client.agency_id)) {
                      agencyId = seed.client.agencyId || seed.client.agency_id;
                    } else if (selectedClient && (selectedClient.agencyId || selectedClient.agency_id)) {
                      agencyId = selectedClient.agencyId || selectedClient.agency_id;
                    }
                  }
                  if (agencyId) {
                    const agency = agencies.find(a => a.id === agencyId);
                    return agency ? `${agency.name}${agency.address ? ' - ' + agency.address : ''}` : `Erreur: agence non trouvée (ID: ${agencyId})`;
                  }
                  return 'Erreur: ID agence non spécifié.';
                })()}
              </div>
            ) : (
              <select
                value={formData.step1?.departureAgencyId || ''}
                onChange={(e) => {
                  // On stocke l'ID (source de vérité) ; le libellé ne sert qu'à l'affichage.
                  const agency = agencies.find(a => a.id === e.target.value);
                  setFormData(prev => ({
                    ...prev,
                    step1: {
                      ...prev.step1,
                      departureAgencyId: e.target.value,
                      departureLocation: agency ? (agency.name || agency.address || '') : '',
                    }
                  }));
                }}
                disabled={isLoadingAgencies}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-slate-100"
              >
                <option value="">{isLoadingAgencies ? (lang === 'fr' ? 'Chargement...' : 'جاري التحميل...') : (lang === 'fr' ? 'Sélectionner une agence...' : 'اختر وكالة...')}</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name} {agency.address ? `- ${agency.address}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Return */}
        <div className="space-y-4">
          <h4 className="text-lg font-black text-blue-700 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            {lang === 'fr' ? 'Retour' : 'العودة'}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-900 mb-2">
                📅 {lang === 'fr' ? 'Date' : 'التاريخ'}
              </label>
              <input
                type="date"
                value={formData.step1?.returnDate || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  step1: { ...prev.step1!, returnDate: e.target.value }
                }))}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-900 mb-2">
                🕐 {lang === 'fr' ? 'Heure' : 'الوقت'}
              </label>
              <input
                type="time"
                value={formData.step1?.returnTime || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  step1: { ...prev.step1!, returnTime: e.target.value }
                }))}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Agence différente button */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowReturnLocation(!showReturnLocation)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-colors ${
                showReturnLocation
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-2 border-slate-300'
              }`}
            >
              🏢 {lang === 'fr' ? 'Agence différente' : 'وكالة مختلفة'}
            </button>
          </div>

          {/* Return Location - shown only when Agence différente is clicked */}
          <AnimatePresence>
            {showReturnLocation && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div>
                  <label className="block font-bold text-slate-900 mb-2">
                    📍 {lang === 'fr' ? 'Lieu de Restitution' : 'مكان الإرجاع'}
                  </label>
                  <select
                    value={formData.step1?.returnAgencyId || ''}
                    onChange={(e) => {
                      const agency = agencies.find(a => a.id === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        step1: {
                          ...prev.step1,
                          returnAgencyId: e.target.value,
                          returnLocation: agency ? (agency.name || agency.address || '') : '',
                        }
                      }));
                    }}
                    disabled={isLoadingAgencies}
                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-100"
                  >
                    <option value="">{isLoadingAgencies ? (lang === 'fr' ? 'Chargement...' : 'جاري التحميل...') : (lang === 'fr' ? 'Sélectionner une agence...' : 'اختر وكالة...')}</option>
                    {agencies.map((agency) => (
                      <option key={agency.id} value={agency.id}>
                        {agency.name} {agency.address ? `- ${agency.address}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    {/* Duration Summary */}
    {(formData.step1?.departureDate && formData.step1?.returnDate) && (
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
        <h4 className="text-lg font-black text-slate-900 mb-4">
          ⏱️ {lang === 'fr' ? 'Résumé de Durée' : 'ملخص المدة'}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-slate-600">{lang === 'fr' ? 'Jours' : 'الأيام'}</p>
            <p className="text-2xl font-black text-slate-900">
              {Math.ceil((new Date(formData.step1.returnDate).getTime() - new Date(formData.step1.departureDate).getTime()) / (1000 * 60 * 60 * 24))}
            </p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-slate-600">{lang === 'fr' ? 'Départ' : 'المغادرة'}</p>
            <p className="text-lg font-bold text-slate-900">{formData.step1.departureDate}</p>
            <p className="text-sm text-slate-600">{formData.step1.departureTime}</p>
          </div>
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-slate-600">{lang === 'fr' ? 'Retour' : 'العودة'}</p>
            <p className="text-lg font-bold text-slate-900">{formData.step1.returnDate}</p>
            <p className="text-sm text-slate-600">{formData.step1.returnTime}</p>
          </div>
        </div>
      </div>
    )}
  </div>
);
};
// Step 2: Vehicle Selection
export const Step2VehicleSelection: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
}> = ({ lang, formData, setFormData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [reservedCars, setReservedCars] = useState<any[]>([]);
  const [isLoadingCars, setIsLoadingCars] = useState(false);
  const [deselectAlert, setDeselectAlert] = useState(false);

  const departureDate = formData.step1?.departureDate;
  const returnDate    = formData.step1?.returnDate;
  const hasDates      = !!departureDate && !!returnDate;

  // Reload whenever the date range changes (both dates must be in the dependency array)
  useEffect(() => {
    if (!hasDates) {
      setAvailableCars([]);
      setReservedCars([]);
      return;
    }

    const loadCars = async () => {
      try {
        setIsLoadingCars(true);
        const [avail, reserved] = await Promise.all([
          DatabaseService.getAvailableCars(departureDate, returnDate),
          DatabaseService.getReservedCarsForPeriod(departureDate!, returnDate!),
        ]);

        setAvailableCars(avail || []);
        setReservedCars(reserved || []);

        // Auto-désélectionne si la voiture choisie devient indisponible après un changement de dates
        const selectedId = (formData as any).step2?.selectedCar?.id;
        if (selectedId) {
          const stillAvailable = (avail || []).some(c => c.id === selectedId);
          if (!stillAvailable) {
            setFormData(prev => ({ ...prev, step2: { ...((prev as any).step2 || {}), selectedCar: undefined } }));
            setDeselectAlert(true);
            setTimeout(() => setDeselectAlert(false), 5000);
          }
        }
      } catch (err) {
        console.error('Error loading cars:', err);
        setAvailableCars([]);
        setReservedCars([]);
      } finally {
        setIsLoadingCars(false);
      }
    };

    loadCars();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureDate, returnDate]);

  // Filtrer la recherche uniquement sur les voitures disponibles
  const filteredAvailable = availableCars.filter(car =>
    car.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
    car.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
    car.registration.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-black text-slate-900">
        🚗 {lang === 'fr' ? 'Sélection du Véhicule' : 'اختيار المركبة'}
      </h3>

      {/* Alert déselection */}
      {deselectAlert && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-orange-50 border border-orange-300 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <p className="text-sm font-bold text-orange-800">
            {lang === 'fr'
              ? 'La voiture sélectionnée n\'est plus disponible pour ces dates.'
              : 'السيارة المختارة لم تعد متاحة لهذه التواريخ.'}
          </p>
        </motion.div>
      )}

      {/* Message si pas de dates */}
      {!hasDates && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center">
          <span className="text-5xl mb-4 block">📅</span>
          <p className="text-slate-600 font-bold text-lg">
            {lang === 'fr' ? 'Choisissez d\'abord les dates' : 'اختر التواريخ أولاً'}
          </p>
          <p className="text-slate-400 text-sm mt-2">
            {lang === 'fr'
              ? 'Retournez à l\'étape 1 pour sélectionner une période de location.'
              : 'ارجع إلى الخطوة 1 لاختيار فترة الإيجار.'}
          </p>
        </div>
      )}

      {hasDates && (
        <>
          {/* Véhicules réservés — alerte ambre EN PREMIER */}
          {reservedCars.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h4 className="font-black text-amber-900 text-lg">
                    {lang === 'fr' ? 'Réservés sur cette période' : 'محجوزة في هذه الفترة'}
                    <span className="ml-2 text-sm font-semibold text-amber-700">({reservedCars.length})</span>
                  </h4>
                  <p className="text-sm text-amber-700 mt-1">
                    {lang === 'fr'
                      ? 'Ces véhicules ne sont pas disponibles — cliquez pour voir les détails.'
                      : 'هذه المركبات غير متاحة — انقر لرؤية التفاصيل.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {reservedCars.map((reservation) => (
                  <div key={reservation.id}
                    className="bg-white rounded-xl p-3 border border-amber-200 opacity-70 cursor-not-allowed"
                    style={{ cursor: 'not-allowed' }}
                  >
                    <div className="relative mb-2 overflow-hidden rounded-lg bg-slate-100 h-24">
                      <img src={reservation.image} alt={`${reservation.brand} ${reservation.model}`}
                        className="w-full h-full object-cover grayscale" referrerPolicy="no-referrer" />
                      {/* Badge Indisponible */}
                      <div className="absolute top-1 left-1 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded">
                        {lang === 'fr' ? 'Indisponible' : 'غير متاح'}
                      </div>
                    </div>
                    <div className="text-xs">
                      <p className="font-bold text-slate-900 truncate">{reservation.brand} {reservation.model}</p>
                      <p className="text-slate-600 text-[10px] mt-1">
                        {lang === 'fr' ? 'Client: ' : 'العميل: '}{reservation.clientName}
                      </p>
                      <div className="mt-1.5 pt-1.5 border-t border-amber-100 text-slate-500 text-[10px]">
                        {new Date(reservation.departureDate).toLocaleDateString()}
                        {' → '}
                        {new Date(reservation.returnDate).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Barre de recherche (disponibles uniquement) */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input type="text"
              placeholder={lang === 'fr' ? 'Rechercher parmi les disponibles...' : 'البحث في المتاحة...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoadingCars}
            />
          </div>

          {/* Chargement */}
          {isLoadingCars && (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                <p className="text-slate-500">{lang === 'fr' ? 'Chargement des véhicules...' : 'جاري تحميل المركبات...'}</p>
              </div>
            </div>
          )}

          {/* Section — véhicules disponibles */}
          {!isLoadingCars && (
            <>
              <div>
                <h4 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  {lang === 'fr' ? 'Véhicules disponibles' : 'المركبات المتاحة'}
                  <span className="text-slate-400 font-semibold">({filteredAvailable.length})</span>
                </h4>

                {filteredAvailable.length === 0 ? (
                  <div className="text-center py-10">
                    <CarIcon className="w-14 h-14 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">
                      {lang === 'fr' ? 'Aucun véhicule disponible sur cette période' : 'لا توجد مركبات متاحة في هذه الفترة'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredAvailable.map((car) => {
                      // Tarifs euros du véhicule ; à défaut, conversion au taux qu'il
                      // implique, sinon au taux de repli. `≈` signale une conversion.
                      const carRate = impliedEurRate(car) ?? DEFAULT_EUR_RATE;
                      const eur = carUnitPrices(car, 'EUR', carRate);
                      return (
                      <motion.div key={car.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          step2: { ...((prev as any).step2 || {}), selectedCar: car }
                        }))}
                        className={`relative overflow-hidden rounded-2xl shadow-lg cursor-pointer transition-all duration-300 ${
                          (formData as any).step2?.selectedCar?.id === car.id
                            ? 'ring-4 ring-blue-500 shadow-2xl'
                            : 'hover:shadow-xl'
                        }`}
                      >
                        {/* Badge disponible */}
                        <div className="absolute top-3 left-3 z-10 bg-green-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow">
                          {lang === 'fr' ? '✓ Disponible' : '✓ متاح'}
                        </div>

                        {/* Selected indicator */}
                        {(formData as any).step2?.selectedCar?.id === car.id && (
                          <div className="absolute top-3 right-3 z-10 bg-blue-500 text-white rounded-full p-1.5">
                            <CheckCircle className="w-5 h-5" />
                          </div>
                        )}

                        {/* Car Image */}
                        <div className="relative h-48 overflow-hidden">
                          <img src={car.images[0]} alt={`${car.brand} ${car.model}`}
                            className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                          <div className="absolute bottom-4 left-4 text-white">
                            <h4 className="text-xl font-black">{car.brand} {car.model}</h4>
                            <p className="text-sm opacity-90">{car.year} • {car.color}</p>
                          </div>
                        </div>

                        {/* Car Details */}
                        <div className="p-6 bg-white">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
                                <Fuel className="w-4 h-4" />
                                <span className="text-sm">{car.energy}</span>
                              </div>
                              <p className="text-xs text-slate-500">{lang === 'fr' ? 'Carburant' : 'الوقود'}</p>
                            </div>
                            <div className="text-center">
                              <div className="flex items-center justify-center gap-1 text-slate-600 mb-1">
                                <CarIcon className="w-4 h-4" />
                                <span className="text-sm">{car.transmission}</span>
                              </div>
                              <p className="text-xs text-slate-500">{lang === 'fr' ? 'Transmission' : 'النقل'}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {([
                              { label: { fr: 'Prix/Jour', ar: 'السعر/يوم' }, dzd: car.priceDay, eur: eur.day, explicit: car.priceDayEur !== undefined, tone: 'text-green-600' },
                              { label: { fr: 'Prix/Semaine', ar: 'السعر/أسبوع' }, dzd: car.priceWeek, eur: eur.week, explicit: car.priceWeekEur !== undefined, tone: 'text-blue-600' },
                              { label: { fr: 'Prix/Mois', ar: 'السعر/شهر' }, dzd: car.priceMonth, eur: eur.month, explicit: car.priceMonthEur !== undefined, tone: 'text-purple-600' },
                            ]).map((row) => (
                              <div key={row.label.fr} className="flex justify-between items-baseline gap-2">
                                <span className="text-sm text-slate-600">{row.label[lang]}</span>
                                <span className="text-right">
                                  <span className={`font-bold ${row.tone}`}>{formatMoney(row.dzd, 'DZD')}</span>
                                  <span
                                    className="block text-xs font-bold text-amber-700"
                                    title={row.explicit
                                      ? (lang === 'fr' ? 'Tarif en euros défini pour ce véhicule' : 'سعر باليورو محدد لهذه المركبة')
                                      : (lang === 'fr' ? `Converti au taux de ${carRate} DA/€` : `محول بسعر ${carRate} د.ج/€`)}
                                  >
                                    {!row.explicit && '≈ '}{formatMoney(row.eur, 'EUR')}
                                  </span>
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-baseline gap-2 text-sm">
                              <span className="text-slate-600">{lang === 'fr' ? 'Caution' : 'الضمان'}</span>
                              <span className="text-right">
                                <span className="font-bold text-slate-900">{formatMoney(car.deposit, 'DZD')}</span>
                                <span className="block text-xs font-bold text-amber-700">
                                  {car.depositEur === undefined && '≈ '}{formatMoney(eur.deposit, 'EUR')}
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Selected Car Summary */}
      {formData.step2?.selectedCar && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200"
        >
          <h4 className="text-lg font-black text-green-900 mb-4 flex items-center gap-2">
            ✅ {lang === 'fr' ? 'Véhicule Sélectionné' : 'المركبة المختارة'}
            <CheckCircle className="w-5 h-5" />
          </h4>
          <div className="flex items-center gap-4">
            <img
              src={formData.step2.selectedCar.images[0]}
              alt={`${formData.step2.selectedCar.brand} ${formData.step2.selectedCar.model}`}
              className="w-16 h-12 rounded-lg object-cover"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="font-bold text-lg">{formData.step2.selectedCar.brand} {formData.step2.selectedCar.model}</p>
              <p className="text-slate-600">{formData.step2.selectedCar.registration} • {formData.step2.selectedCar.color}</p>
              {(() => {
                const car = formData.step2!.selectedCar!;
                const carRate = impliedEurRate(car) ?? DEFAULT_EUR_RATE;
                const eur = carUnitPrices(car, 'EUR', carRate);
                const perDay = lang === 'fr' ? 'jour' : 'يوم';
                return (
                  <p className="font-bold">
                    <span className="text-green-600">{formatMoney(car.priceDay, 'DZD')}/{perDay}</span>
                    <span className="mx-2 text-slate-300">•</span>
                    <span className="text-amber-700">
                      {car.priceDayEur === undefined && '≈ '}{formatMoney(eur.day, 'EUR')}/{perDay}
                    </span>
                  </p>
                );
              })()}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

// Step 3: Departure Inspection
export const Step3DepartureInspection: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
}> = ({ lang, formData, setFormData }) => {
  const [fuelLevel, setFuelLevel] = useState<'full' | 'half' | 'quarter' | 'eighth' | 'empty'>('full');

  // Resolve the selected car (supports both regular and inspection modes)
  const _selectedCar = formData.step2?.selectedCar || (formData as any).car;
  const _carMileage: number | undefined = (_selectedCar as any)?.mileage;

  // Pre-fill with existing inspection mileage, or fall back to current car mileage
  const [mileage, setMileage] = useState(() => {
    const existingMileage = formData.step3?.departureInspection?.mileage;
    if (existingMileage && existingMileage > 0) return existingMileage.toString();
    return _carMileage ? _carMileage.toString() : '';
  });
  const [selectedInspectionLocation, setSelectedInspectionLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<{ url: string; type: string; file?: File }[]>([]);
  const [signature, setSignature] = useState('');
  const [agencies, setAgencies] = useState<any[]>([]);
  const [isLoadingAgencies, setIsLoadingAgencies] = useState(true);
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(true);
  const [newCustomItem, setNewCustomItem] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('securite');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; itemId: string | null; itemName: string }>({ show: false, itemId: null, itemName: '' });

  // Load agencies from database on component mount
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        setIsLoadingAgencies(true);
        const data = await DatabaseService.getAgencies();
        setAgencies(data || []);
      } catch (err) {
        console.error('Error loading agencies:', err);
        setAgencies(AGENCIES); // Fallback to static data
      } finally {
        setIsLoadingAgencies(false);
      }
    };

    loadAgencies();
  }, []);

  // Load checklist items from database
  useEffect(() => {
    const loadChecklistItems = async () => {
      try {
        setIsLoadingChecklist(true);
        const data = await DatabaseService.getInspectionChecklistItems();
        setChecklistItems(data || []);
      } catch (err) {
        console.error('Error loading checklist items:', err);
        // Fallback to hardcoded items if database fails
        setChecklistItems([
          { id: 'sec-1', category: 'securite', item_name: 'Ceintures de sécurité', display_order: 1 },
          { id: 'sec-2', category: 'securite', item_name: 'Freins', display_order: 2 },
          { id: 'sec-3', category: 'securite', item_name: 'Feux', display_order: 3 },
          { id: 'sec-4', category: 'securite', item_name: 'Pneus', display_order: 4 },
          { id: 'sec-5', category: 'securite', item_name: 'Direction', display_order: 5 },
          { id: 'sec-6', category: 'securite', item_name: 'Klaxon', display_order: 6 },
          { id: 'sec-7', category: 'securite', item_name: 'Rétroviseurs', display_order: 7 },
          { id: 'sec-8', category: 'securite', item_name: 'Essuie-glaces', display_order: 8 },
          { id: 'sec-9', category: 'securite', item_name: 'Airbags', display_order: 9 },
          { id: 'sec-10', category: 'securite', item_name: 'Triangle de signalisation', display_order: 10 },
          { id: 'sec-11', category: 'securite', item_name: 'Extincteur', display_order: 11 },
          { id: 'sec-12', category: 'securite', item_name: 'Cric et roue de secours', display_order: 12 },
          { id: 'eq-1', category: 'equipements', item_name: 'GPS', display_order: 1 },
          { id: 'eq-2', category: 'equipements', item_name: 'Siège bébé', display_order: 2 },
          { id: 'eq-3', category: 'equipements', item_name: 'Chaîne neige', display_order: 3 },
          { id: 'eq-4', category: 'equipements', item_name: 'Câbles de démarrage', display_order: 4 },
          { id: 'eq-5', category: 'equipements', item_name: 'Kit de premiers secours', display_order: 5 },
          { id: 'eq-6', category: 'equipements', item_name: 'Radio/CD', display_order: 6 },
          { id: 'eq-7', category: 'equipements', item_name: 'Climatisation', display_order: 7 },
          { id: 'eq-8', category: 'equipements', item_name: 'Verrouillage centralisé', display_order: 8 },
          { id: 'eq-9', category: 'equipements', item_name: 'Ouverture automatique portes', display_order: 9 },
          { id: 'eq-10', category: 'equipements', item_name: 'Régulateur de vitesse', display_order: 10 },
          { id: 'eq-11', category: 'equipements', item_name: 'Caméra de recul', display_order: 11 },
          { id: 'eq-12', category: 'equipements', item_name: 'Capteurs de stationnement', display_order: 12 },
          { id: 'com-1', category: 'confort', item_name: 'Sièges', display_order: 1 },
          { id: 'com-2', category: 'confort', item_name: 'Volant', display_order: 2 },
          { id: 'com-3', category: 'confort', item_name: 'Tableau de bord', display_order: 3 },
          { id: 'com-4', category: 'confort', item_name: 'Éclairage intérieur', display_order: 4 },
          { id: 'com-5', category: 'confort', item_name: 'Vitres électriques', display_order: 5 },
          { id: 'com-6', category: 'confort', item_name: 'Rétroviseurs électriques', display_order: 6 },
          { id: 'com-7', category: 'confort', item_name: 'Autoradio', display_order: 7 },
          { id: 'com-8', category: 'confort', item_name: 'Prises USB', display_order: 8 },
          { id: 'com-9', category: 'confort', item_name: 'Cendrier', display_order: 9 },
          { id: 'com-10', category: 'confort', item_name: 'Coffre-fort', display_order: 10 },
          { id: 'com-11', category: 'confort', item_name: 'Tapis de sol', display_order: 11 },
          { id: 'com-12', category: 'confort', item_name: 'Propreté générale', display_order: 12 }
        ]);
      } finally {
        setIsLoadingChecklist(false);
      }
    };

    loadChecklistItems();
  }, []);

  // Get departure agency name from formData
  const departureAgency = AGENCIES.find(agency => agency.id === (formData.step1?.departureAgencyId || formData.step1?.departureAgency));

  // Initialize selected inspection location with departure agency
  useEffect(() => {
    if (departureAgency && !selectedInspectionLocation) {
      setSelectedInspectionLocation(`${departureAgency.name} - ${departureAgency.city}`);
    }
  }, [departureAgency, selectedInspectionLocation]);

  const inspectionLocation = selectedInspectionLocation || (departureAgency ? `${departureAgency.name} - ${departureAgency.city}` : '');

  // Early return if no step1 data
  if (!formData.step1) {
    return (
      <div className="space-y-8">
        <h3 className="text-2xl font-black text-slate-900">
          🔍 {lang === 'fr' ? 'Inspection de Départ' : 'فحص المغادرة'}
        </h3>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6">
          <p className="text-red-700 font-bold">
            {lang === 'fr' ? 'Erreur: Informations de réservation manquantes. Veuillez revenir à l\'étape précédente.' : 'خطأ: معلومات الحجز مفقودة. يرجى العودة إلى الخطوة السابقة.'}
          </p>
        </div>
      </div>
    );
  }

  // Group checklist items by category
  const groupedItems = checklistItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  // State for checklist responses
  const [checklistResponses, setChecklistResponses] = useState<Record<string, boolean>>({});
  const initializedInspectionRef = React.useRef(false);

  const toggleChecklistItem = (itemId: string) => {
    setChecklistResponses(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  // Initialize from existing inspection data
  useEffect(() => {
    if (!formData.step3?.departureInspection) return;
    if (initializedInspectionRef.current) return;
    initializedInspectionRef.current = true;
    const inspection = formData.step3.departureInspection;
    setFuelLevel(inspection.fuelLevel || 'full');
    // Use saved inspection mileage if > 0, otherwise keep car's current mileage as default
    setMileage(
      inspection.mileage && inspection.mileage > 0
        ? inspection.mileage.toString()
        : _carMileage ? _carMileage.toString() : ''
    );
    setSelectedInspectionLocation(inspection.location || '');
    setNotes(inspection.notes || '');
    setPhotos([
      ...(inspection.interiorPhotos?.map((url: string) => ({ url, type: 'interior' })) || []),
      ...(inspection.exteriorPhotos?.map((url: string) => ({ url, type: 'exterior' })) || [])
    ]);
    setSignature(inspection.signature || '');

    // Initialize checklist responses (robust matching)
    // Stored inspection items may contain either the checklist item id or older response ids,
    // so we attempt to match by id first, then by name as a fallback.
    const responses: Record<string, boolean> = {};
    const masterItems = checklistItems || [];
    // If we already have a master list, build responses for those
    if (masterItems.length > 0) {
      masterItems.forEach((master: any) => {
        const saved = inspection.inspectionItems?.find((si: any) => (
          si.id === master.id || // best case: stored uses checklist item id
          si.name === master.item_name || // fallback: match by name
          si.responseId === master.id // if mapping included responseId
        ));
        responses[master.id] = saved ? !!saved.checked : false;
      });
    } else {
      // If master list not yet loaded, map whatever we have keyed by stored ids/names
      inspection.inspectionItems?.forEach((item: any) => {
        responses[item.id] = item.checked;
        if (item.name) responses[item.name] = item.checked;
      });
    }
    setChecklistResponses(responses);
  }, [formData.step3?.departureInspection]);

  const saveInspectionData = () => {
    // Prepare inspection items from checklist responses
    const inspectionItems: any[] = [];
    Object.entries(checklistResponses).forEach(([itemId, checked]) => {
      const item = checklistItems.find(i => i.id === itemId);
      if (item) {
        inspectionItems.push({
          id: item.id,
          category: item.category,
          name: item.item_name,
          checked: checked
        });
      }
    });

    // Save inspection data to formData
    setFormData(prev => ({
      ...prev,
      step3: {
        departureInspection: {
          id: prev.step3?.departureInspection?.id || `inspection_${Date.now()}`,
          reservationId: prev.id || '',
          type: 'departure',
          mileage: parseInt(mileage) || 0,
          fuelLevel: fuelLevel,
          location: inspectionLocation,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().split(' ')[0],
          interiorPhotos: photos.filter(p => p.type === 'interior').map(p => p.url),
          exteriorPhotos: photos.filter(p => p.type === 'exterior').map(p => p.url),
          inspectionItems: inspectionItems,
          notes: notes,
          signature: signature,
          createdAt: prev.step3?.departureInspection?.createdAt || new Date().toISOString()
        }
      }
    }));
  };

  // Auto-save inspection data when key fields change
  useEffect(() => {
    if (mileage || fuelLevel !== 'full' || notes || signature || photos.length > 0 || Object.keys(checklistResponses).length > 0) {
      saveInspectionData();
    }
  }, [mileage, fuelLevel, notes, signature, photos, checklistResponses]);

  const addCustomChecklistItem = async () => {
    if (!newCustomItem.trim()) return;

    try {
      const newItem = await DatabaseService.createInspectionChecklistItem({
        category: selectedCategory,
        item_name: newCustomItem.trim(),
        display_order: groupedItems[selectedCategory]?.length || 0
      });

      setChecklistItems(prev => [...prev, newItem]);
      // initialize response for the newly added item to false (unchecked)
      setChecklistResponses(prev => ({ ...prev, [newItem.id]: false }));
      setNewCustomItem('');
    } catch (error: any) {
      console.error('Error adding checklist item:', error);
      // Check if it's an RLS policy error
      if (error?.code === '42501') {
        alert(lang === 'fr' 
          ? 'Erreur: Les politiques de sécurité de la base de données empêchent l\'ajout. Veuillez contacter l\'administrateur.' 
          : 'خطأ: سياسات الأمان في قاعدة البيانات تمنع الإضافة. يرجى الاتصال بالمسؤول.');
      } else {
        alert(lang === 'fr' ? 'Erreur lors de l\'ajout de l\'élément' : 'خطأ في إضافة العنصر');
      }
    }
  };

  const removeChecklistItem = async (itemId: string) => {
    const item = checklistItems.find(i => i.id === itemId);
    setDeleteConfirmation({ show: true, itemId, itemName: item?.item_name || '' });
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirmation.itemId) return;

    try {
      await DatabaseService.deleteInspectionChecklistItem(deleteConfirmation.itemId);
      setChecklistItems(prev => prev.filter(item => item.id !== deleteConfirmation.itemId));
      setDeleteConfirmation({ show: false, itemId: null, itemName: '' });
    } catch (error: any) {
      console.error('Error deleting checklist item:', error);
      // Check if it's an RLS policy error
      if (error?.code === '42501') {
        alert(lang === 'fr' 
          ? 'Erreur: Les politiques de sécurité de la base de données empêchent la suppression. Veuillez contacter l\'administrateur.' 
          : 'خطأ: سياسات الأمان في قاعدة البيانات تمنع الحذف. يرجى الاتصال بالمسؤول.');
      } else {
        alert(lang === 'fr' ? 'Erreur lors de la suppression de l\'élément' : 'خطأ في حذف العنصر');
      }
      setDeleteConfirmation({ show: false, itemId: null, itemName: '' });
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadInspectionImage(file, undefined, type);
      if (result.success && result.url) {
        setPhotos(prev => [...prev, { url: result.url!, type, file }]);
      } else {
        alert(result.error || (lang === 'fr' ? 'Erreur lors du téléchargement' : 'خطأ في التحميل'));
      }
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert(lang === 'fr' ? 'Erreur lors du téléchargement' : 'خطأ في التحميل');
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const inspectionCategories = [
    {
      key: 'securite',
      title: lang === 'fr' ? 'Sécurité' : 'الأمان',
      icon: '🛡️',
      items: groupedItems.securite || []
    },
    {
      key: 'equipements',
      title: lang === 'fr' ? 'Équipements' : 'المعدات',
      icon: '🔧',
      items: groupedItems.equipements || []
    },
    {
      key: 'confort',
      title: lang === 'fr' ? 'Confort & Propreté' : 'الراحة والنظافة',
      icon: '✨',
      items: groupedItems.confort || []
    }
  ];

  // Update formData with inspection data
  useEffect(() => {
    if (mileage && inspectionLocation) {
      const inspectionData: VehicleInspection = {
        id: `inspection_${Date.now()}`,
        reservationId: '',
        type: 'departure',
        mileage: parseInt(mileage) || 0,
        fuelLevel,
        location: inspectionLocation,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().split(' ')[0],
        interiorPhotos: photos.filter(photo => photo.type === 'interior').map(p => p.url),
        exteriorPhotos: photos.filter(photo => photo.type.includes('exterior')).map(p => p.url),
        inspectionItems: checklistItems.map((item) => ({
          id: item.id,
          name: item.item_name,
          checked: checklistResponses[item.id] || false,
          category: item.category === 'securite' ? 'security' :
                   item.category === 'equipements' ? 'equipment' :
                   item.category === 'confort' ? 'comfort' : 'cleanliness'
        })),
        notes,
        createdAt: new Date().toISOString()
      };

      setFormData(prev => ({
        ...prev,
        step3: {
          ...prev.step3,
          departureInspection: inspectionData
        }
      }));
    }
  }, [mileage, fuelLevel, inspectionLocation, notes, photos, checklistItems, checklistResponses, setFormData]);

  // When the checklist items list changes (e.g., after adding/removing items),
  // merge any stored inspection responses and preserve current UI state.
  useEffect(() => {
    const storedInspection = formData.step3?.departureInspection;
    // Only add missing entries; avoid calling setState if nothing to change
    setChecklistResponses(prev => {
      const next: Record<string, boolean> = { ...prev };
      let needsUpdate = false;
      checklistItems.forEach((item) => {
        if (next[item.id] === undefined) {
          const saved = storedInspection?.inspectionItems?.find((it: any) => it.id === item.id);
          next[item.id] = saved ? !!saved.checked : false;
          needsUpdate = true;
        }
      });
      return needsUpdate ? next : prev;
    });
    // Intentionally only depend on checklistItems to avoid reacting to formData changes
  }, [checklistItems]);

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-black text-slate-900">
        🔍 {lang === 'fr' ? 'Inspection de Départ' : 'فحص المغادرة'}
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Vehicle Info */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
          <h4 className="text-lg font-black text-slate-900 mb-4">
            🚗 {lang === 'fr' ? 'Informations Véhicule' : 'معلومات المركبة'}
          </h4>
          {(formData.step2?.selectedCar || formData.car) && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={(formData.step2?.selectedCar || formData.car)?.images?.[0]}
                  alt={`${(formData.step2?.selectedCar || formData.car)?.brand} ${(formData.step2?.selectedCar || formData.car)?.model}`}
                  className="w-16 h-12 rounded-lg object-cover"
                />
                <div>
                  <p className="font-bold text-lg">{(formData.step2?.selectedCar || formData.car)?.brand} {(formData.step2?.selectedCar || formData.car)?.model}</p>
                  <p className="text-slate-600">{(formData.step2?.selectedCar || formData.car)?.registration}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm border-t border-slate-200 pt-3">
                <div className="flex justify-between">
                  <span className="text-slate-600">📋 {lang === 'fr' ? 'Immatriculation' : 'لوحة الترخيص'}:</span>
                  <span className="font-bold">{(formData.step2?.selectedCar || formData.car)?.registration}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">🎨 {lang === 'fr' ? 'Couleur' : 'اللون'}:</span>
                  <span className="font-bold">{(formData.step2?.selectedCar || formData.car)?.color}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">📅 {lang === 'fr' ? 'Année' : 'السنة'}:</span>
                  <span className="font-bold">{(formData.step2?.selectedCar || formData.car)?.year}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">⛽ {lang === 'fr' ? 'Énergie' : 'الوقود'}:</span>
                  <span className="font-bold">{(formData.step2?.selectedCar || formData.car)?.energy}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Basic Inspection Info */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
          <h4 className="text-lg font-black text-slate-900 mb-4">
            📊 {lang === 'fr' ? 'Informations de Base' : 'المعلومات الأساسية'}
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block font-bold text-slate-900 mb-2">
                🛣️ {lang === 'fr' ? 'Kilométrage au Départ' : 'عداد الكيلومترات عند المغادرة'}
              </label>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold text-slate-900"
                placeholder="0"
                min="0"
              />
              {/* Always show current car mileage as reference */}
              {_carMileage !== undefined && _carMileage > 0 && (
                <div className="mt-1.5 flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-blue-500 text-xs">📌</span>
                  <p className="text-xs font-bold text-blue-700">
                    {lang === 'fr'
                      ? `Kilométrage actuel du véhicule : ${_carMileage.toLocaleString()} km`
                      : `عداد الكيلومترات الحالي للمركبة: ${_carMileage.toLocaleString()} كم`}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-900 mb-3">
                ⛽ {lang === 'fr' ? 'Niveau de Carburant' : 'مستوى الوقود'}
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { value: 'full', label: 'PLEIN' },
                  { value: 'half', label: '1/2' },
                  { value: 'quarter', label: '1/4' },
                  { value: 'eighth', label: '1/8' },
                  { value: 'empty', label: 'VIDE' }
                ].map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setFuelLevel(level.value as any)}
                    className={`p-2 text-xs border rounded-lg font-bold transition-colors ${
                      fuelLevel === level.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-900 mb-2">
                📍 {lang === 'fr' ? 'Lieu d\'Inspection' : 'مكان الفحص'}
              </label>
              <select
                value={selectedInspectionLocation}
                onChange={(e) => setSelectedInspectionLocation(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoadingAgencies}
              >
                <option value="">
                  {isLoadingAgencies 
                    ? (lang === 'fr' ? 'Chargement...' : 'جاري التحميل...') 
                    : (lang === 'fr' ? 'Sélectionner une agence...' : 'اختر وكالة...')
                  }
                </option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={`${agency.name} - ${agency.city}`}>
                    {agency.name} - {agency.city}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
          <h4 className="text-lg font-black text-slate-900 mb-4">
            📝 {lang === 'fr' ? 'Notes d\'Inspection (Optionnel)' : 'ملاحظات الفحص (اختياري)'}
          </h4>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={8}
            placeholder={lang === 'fr' ? 'État général du véhicule, observations particulières...' : 'الحالة العامة للمركبة، ملاحظات خاصة...'}
          />
        </div>
      </div>

      {/* Inspection Checklist */}
      <div className="space-y-6">
        <h4 className="text-xl font-black text-slate-900">
          ✅ {lang === 'fr' ? 'Contrôle d\'État du Véhicule' : 'فحص حالة المركبة'}
        </h4>

        {inspectionCategories.map((category) => (
          <div key={category.key} className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <h5 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
              {category.icon} {category.title}
            </h5>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg transition-all ${
                    checklistResponses[item.id]
                      ? 'border-green-500 bg-green-50'
                      : 'border-red-300 bg-red-50'
                  }`}
                >
                  <div
                    onClick={() => toggleChecklistItem(item.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center cursor-pointer ${
                      checklistResponses[item.id] ? 'border-green-500 bg-green-500' : 'border-red-300 bg-red-300'
                    }`}
                  >
                    {checklistResponses[item.id] && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className={`font-bold flex-1 ${checklistResponses[item.id] ? 'text-green-800' : 'text-red-800'}`}>
                    {item.item_name}
                  </span>
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="text-red-500 hover:text-red-700 p-1"
                    title={lang === 'fr' ? 'Supprimer cet élément' : 'حذف هذا العنصر'}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add custom item */}
            <div className="flex gap-2 mt-4">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="securite">🛡️ Sécurité</option>
                <option value="equipements">🔧 Équipements</option>
                <option value="confort">✨ Confort</option>
              </select>
              <input
                type="text"
                value={newCustomItem}
                onChange={(e) => setNewCustomItem(e.target.value)}
                placeholder={lang === 'fr' ? 'Ajouter un élément personnalisé...' : 'إضافة عنصر مخصص...'}
                className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyPress={(e) => e.key === 'Enter' && addCustomChecklistItem()}
              />
              <button
                onClick={addCustomChecklistItem}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Photo Upload */}
      <div className="bg-orange-50 rounded-2xl p-6 border border-orange-200">
        <h4 className="text-lg font-black text-orange-900 mb-4">
          📸 {lang === 'fr' ? 'Photos d\'État Initial' : 'صور الحالة الأولية'}
        </h4>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {/* Upload buttons */}
          {[
            { label: 'Extérieur Avant', type: 'exterior_front' },
            { label: 'Intérieur', type: 'interior' },
            { label: 'Extérieur Arrière', type: 'exterior_rear' },
            { label: 'Autres', type: 'other' }
          ].map((item) => (
            <div key={item.type} className="relative">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handlePhotoUpload(e, item.type)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="aspect-square border-2 border-dashed border-orange-300 rounded-lg flex flex-col items-center justify-center hover:bg-orange-100 transition-colors">
                <Upload className="w-8 h-8 text-orange-500 mb-2" />
                <span className="text-sm text-orange-700 font-bold text-center">
                  {lang === 'fr' ? item.label : (item.label === 'Extérieur Avant' ? 'الخارج الأمامي' : item.label === 'Intérieur' ? 'الداخل' : item.label === 'Extérieur Arrière' ? 'الخارج الخلفي' : 'أخرى')}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Display uploaded photos */}
        {photos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map((photo, index) => {
              // Resolve possible stored path into absolute URL
              const resolveUrl = (u?: string) => {
                if (!u) return u;
                if (u.startsWith('http')) return u;
                const base = import.meta.env.VITE_SUPABASE_URL || '';
                if (!base) return u;
                // If it's already a storage path
                if (u.startsWith('/')) return `${base}${u}`;
                if (u.includes('/storage/v1')) return `${base}${u}`;
                // If it already contains 'inspection' path, just prefix host
                if (u.includes('inspection')) return `${base}/storage/v1/object/public/${u.replace(/^\/+/, '')}`;
                // default: assume it's a filename stored in inspection bucket
                return `${base}/storage/v1/object/public/inspection/${u}`;
              };

              const src = resolveUrl(photo.url);

              return (
                <div key={index} className="relative group">
                  <img
                    src={src}
                    alt={`Photo ${index + 1}`}
                    className="w-full aspect-square object-cover rounded-lg border border-orange-200"
                  />
                  <button
                    onClick={() => removePhoto(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Signature Section */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-200">
        <h4 className="text-lg font-black text-purple-900 mb-4">
          ✍️ {lang === 'fr' ? 'Signature du Client' : 'توقيع العميل'}
        </h4>

        <div className="flex flex-col items-center space-y-4">
            <div className="bg-white border-2 border-dashed border-purple-300 rounded-2xl p-4 shadow-inner">
            <SignaturePad lang={lang} initialSignature={signature} onSignatureChange={setSignature} />
          </div>
          {/* preview raw signature in case canvas doesn't render URL */}
          {signature && !signature.startsWith('data:') && (
            <div className="mt-2">
              <img src={signature} alt="signature" className="max-w-full h-auto border" />
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="signature-confirm"
              className="w-5 h-5 text-purple-600 border-purple-300 rounded focus:ring-purple-500"
            />
            <label htmlFor="signature-confirm" className="text-purple-900 font-bold text-sm">
              {lang === 'fr' ? 'Je confirme avoir inspecté le véhicule et accepte son état actuel' : 'أؤكد أنني قمت بفحص المركبة وأقبل حالتها الحالية'}
            </label>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-red-200"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2">
              {lang === 'fr' ? 'Confirmer la suppression' : 'تأكيد الحذف'}
            </h3>
            <p className="text-slate-600 text-center mb-6">
              {lang === 'fr' 
                ? `Êtes-vous sûr de vouloir supprimer l'élément "${deleteConfirmation.itemName}"?` 
                : `هل أنت متأكد من حذف "${deleteConfirmation.itemName}"?`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmation({ show: false, itemId: null, itemName: '' })}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-900 rounded-lg font-bold hover:bg-slate-50 transition-colors"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                onClick={confirmDeleteItem}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                {lang === 'fr' ? 'Supprimer' : 'حذف'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export const Step4ClientSelection: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
}> = ({ lang, formData, setFormData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  // Sans recherche : seulement les 6 derniers clients créés.
  // Avec recherche : interrogation serveur sur TOUTE la base clients.
  const [recentClients, setRecentClients] = useState<Client[]>([]);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the last 6 clients from database
  useEffect(() => {
    const loadClients = async () => {
      setLoading(true);
      try {
        const list = await DatabaseService.getRecentClients(6);
        setRecentClients(list);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load clients:', err);
        setError('Impossible de charger les clients');
      } finally {
        setLoading(false);
      }
    };
    loadClients();
  }, []);

  // Recherche serveur avec debounce (couvre les clients hors des 6 récents)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await DatabaseService.searchClients(q);
        setSearchResults(results);
      } catch (err) {
        console.error('Client search failed:', err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isSearchMode = searchQuery.trim().length > 0;
  const filteredClients = isSearchMode ? searchResults : recentClients;

  const handleSaveClient = async (clientData: Partial<Client>): Promise<void> => {
    try {
      const created = await DatabaseService.createClient(clientData as Omit<Client, 'id' | 'createdAt'>);
      setRecentClients(prev => [created, ...prev].slice(0, 6));

      // Auto-select the newly created client and close modal
      setFormData(prev => ({
        ...prev,
        step4: { selectedClient: created }
      }));
      setIsClientModalOpen(false);
    } catch (err) {
      console.error('Error saving client:', err);
      throw new Error(lang === 'fr' ? 'Erreur lors de l\'enregistrement' : 'خطأ في الحفظ');
    }
  };

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-black text-slate-900">
        👤 {lang === 'fr' ? 'Sélection du Client' : 'اختيار العميل'}
      </h3>

      {/* Error Display */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-2xl p-4"
        >
          <p className="text-red-600 font-medium">⚠️ {error}</p>
        </motion.div>
      )}

      {/* Search and Add New */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-3 text-saas-text-muted" size={18} />
          <input
            type="text"
            placeholder={lang === 'fr' ? 'Rechercher un client...' : 'ابحث عن عميل...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-saas pl-10 w-full"
          />
        </div>
        <button
          onClick={() => setIsClientModalOpen(true)}
          className="btn-saas-primary whitespace-nowrap w-full sm:w-auto justify-center"
        >
          <Plus size={18} />
          {lang === 'fr' ? 'Nouveau Client' : 'عميل جديد'}
        </button>
      </div>

      {/* Indication : 6 derniers clients ou résultats de recherche */}
      {!loading && (
        <p className="text-xs font-bold uppercase tracking-widest text-saas-text-muted">
          {isSearchMode
            ? (lang === 'fr' ? `🔎 Résultats de recherche (${filteredClients.length})` : `🔎 نتائج البحث (${filteredClients.length})`)
            : (lang === 'fr' ? '🕒 Les 6 derniers clients — utilisez la recherche pour trouver les autres' : '🕒 آخر 6 عملاء — استخدم البحث للعثور على الآخرين')}
        </p>
      )}

      {/* Loading State */}
      {loading || searching ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-saas-primary-via"></div>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl opacity-30 mb-4">👥</div>
          <p className="text-saas-text-muted font-semibold">
            {lang === 'fr' ? 'Aucun client trouvé' : 'لم يتم العثور على عملاء'}
          </p>
        </div>
      ) : (
        /* Client List */
        <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredClients.map((client) => (
              <motion.div
                key={client.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={() => setFormData(prev => ({
                  ...prev,
                  step4: { selectedClient: client }
                }))}
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all hover:scale-105 ${
                  formData.step4?.selectedClient?.id === client.id
                    ? 'border-saas-primary-via bg-blue-50 shadow-lg'
                    : 'border-saas-border hover:border-saas-primary-muted hover:shadow-md'
                }`}
              >
                <div className="text-center">
                  {client.profilePhoto ? (
                    <img
                      src={client.profilePhoto}
                      alt={`${client.firstName} ${client.lastName}`}
                      className="w-16 h-16 rounded-full object-cover mx-auto mb-3 border-2 border-saas-primary-muted"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full mx-auto mb-3 border-2 border-saas-primary-muted flex items-center justify-center bg-saas-bg">
                      <span className="text-2xl">👤</span>
                    </div>
                  )}
                  <p className="font-bold text-sm text-saas-text-main">{client.firstName} {client.lastName}</p>
                  <p className="text-saas-text-muted text-xs">📱 {client.phone}</p>
                  <p className="text-saas-text-muted text-xs">🆔 {client.licenseNumber}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Selected Client Summary */}
      {formData.step4?.selectedClient && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-linear-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200"
        >
          <h4 className="text-lg font-black text-green-900 mb-4 flex items-center gap-2">
            <CheckCircle size={20} />
            {lang === 'fr' ? 'Client Sélectionné' : 'العميل المختار'}
          </h4>
          <div className="flex items-center gap-4">
            {formData.step4.selectedClient.profilePhoto ? (
              <img
                src={formData.step4.selectedClient.profilePhoto}
                alt={`${formData.step4.selectedClient.firstName} ${formData.step4.selectedClient.lastName}`}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-200">
                <span className="text-lg">👤</span>
              </div>
            )}
            <div>
              <p className="font-bold text-lg text-saas-text-main">{formData.step4.selectedClient.firstName} {formData.step4.selectedClient.lastName}</p>
              <p className="text-saas-text-muted">{formData.step4.selectedClient.phone}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Client Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSave={handleSaveClient}
        lang={lang}
      />
    </div>
  );
};

// Step: Protection Assurance selection (before Services)
export const Step5ProtectionAssurance: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
}> = ({ lang, formData, setFormData }) => {
  const [assurances, setAssurances] = useState<ProtectionAssurance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setAssurances(await DatabaseService.getProtectionAssurances());
      } catch (err) {
        console.error('Error loading protection assurances:', err);
        setAssurances([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const selected = formData.protectionAssurance || null;

  // Nombre de jours (pour afficher le coût total du forfait)
  const days = (() => {
    const d1 = formData.step1?.departureDate;
    const d2 = formData.step1?.returnDate;
    if (!d1 || !d2) return 0;
    return Math.max(0, Math.ceil((new Date(d2).getTime() - new Date(d1).getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const selectAssurance = (a: ProtectionAssurance | null) => {
    setFormData(prev => ({ ...prev, protectionAssurance: a || undefined }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-black text-slate-900">
          🛡️ {lang === 'fr' ? 'Assurance de Protection' : 'تأمين الحماية'}
        </h3>
        <p className="text-slate-500 text-sm mt-1">
          {lang === 'fr'
            ? 'Sélectionnez un forfait de protection (optionnel) — chaque élément couvert est affiché avec son statut'
            : 'اختر باقة حماية (اختياري) — يتم عرض كل عنصر مشمول مع حالته'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : assurances.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-10 text-center">
          <div className="text-5xl opacity-30 mb-3">🛡️</div>
          <p className="font-bold text-slate-700">{lang === 'fr' ? 'Aucune assurance de protection disponible' : 'لا يوجد تأمين حماية متاح'}</p>
          <p className="text-slate-500 text-sm mt-1">
            {lang === 'fr' ? 'Créez-en dans « Protection & Services »' : 'أنشئها في «الحماية والخدمات»'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Option "aucune assurance" */}
          <button
            type="button"
            onClick={() => selectAssurance(null)}
            className={`text-left rounded-2xl p-5 border-2 transition-all ${
              !selected ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-black text-slate-900">{lang === 'fr' ? 'Sans assurance' : 'بدون تأمين'}</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center ${!selected ? 'bg-indigo-500 text-white' : 'border-2 border-slate-300'}`}>
                {!selected && <Check size={14} strokeWidth={3} />}
              </span>
            </div>
            <p className="text-slate-500 text-sm mt-2">{lang === 'fr' ? 'Aucun forfait de protection' : 'لا باقة حماية'}</p>
          </button>

          {assurances.map(a => {
            const isSel = selected?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => selectAssurance(a)}
                className={`text-left rounded-2xl p-5 border-2 transition-all flex flex-col ${
                  isSel ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-900 truncate">{a.name}</h4>
                    <p className="text-indigo-600 font-black text-sm">
                      {a.pricePerDay.toLocaleString()} DA/{lang === 'fr' ? 'jour' : 'يوم'}
                    </p>
                  </div>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isSel ? 'bg-indigo-500 text-white' : 'border-2 border-slate-300'}`}>
                    {isSel && <Check size={14} strokeWidth={3} />}
                  </span>
                </div>

                {a.items.length > 0 && (
                  <ul className="space-y-1.5 flex-1">
                    {a.items.map(item => (
                      <li key={item.linkId || item.itemId} className="flex items-center gap-2 text-sm">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                          item.status ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                        }`}>
                          {item.status ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
                        </span>
                        <span className={item.status ? 'text-slate-700' : 'text-slate-400 line-through'}>{item.name}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {days > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between text-xs">
                    <span className="text-slate-500">{days} {lang === 'fr' ? 'jour(s)' : 'يوم'}</span>
                    <span className="font-black text-indigo-600">{(a.pricePerDay * days).toLocaleString()} DA</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Step 5: Additional Services
export const Step5AdditionalServices: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
}> = ({ lang, formData, setFormData }) => {
  const [services, setServices] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [driverCaution, setDriverCaution] = useState(0);
  const [newService, setNewService] = useState({ name: '', price: 0, description: '', category: 'service' });
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [showDriverList, setShowDriverList] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ show: boolean; serviceId: string | null; serviceName: string }>({ show: false, serviceId: null, serviceName: '' });

  // Load services from database on mount
  useEffect(() => {
    const loadServices = async () => {
      try {
        setLoadingServices(true);
        const dbServices = await DatabaseService.getServices();
        setServices(dbServices);
      } catch (err) {
        console.error('Error loading services:', err);
        setServices([]);
      } finally {
        setLoadingServices(false);
      }
    };
    loadServices();
  }, []);

  // Ensure selected services are properly maintained when services load
  useEffect(() => {
    if (services.length > 0 && formData.step5?.additionalServices) {
      // Check if all selected services still exist in the loaded services
      // For editing existing reservations, the services come from reservation_services table
      // We need to match them with the master services table
      const validServices = formData.step5.additionalServices.map(selectedService => {
        // Try to find matching service in master services table
        const matchingMasterService = services.find(masterService => {
          const masterName = masterService.name || masterService.service_name;
          const selectedName = (selectedService.name || selectedService.service_name);
          const idsMatch = masterService.id && (masterService.id === selectedService.id || masterService.id === selectedService.originalServiceId || masterService.id === selectedService.service_id);
          const namesMatch = masterName && selectedName && masterName === selectedName;
          const categoriesMatch = !selectedService.category || masterService.category === selectedService.category;
          return categoriesMatch && (idsMatch || namesMatch);
        });

        // If found, use the master service data but keep the selected service's additional fields
        if (matchingMasterService) {
          return {
            ...matchingMasterService,
            ...selectedService, // Keep any additional fields like driver_id, driver_caution
            originalServiceId: matchingMasterService.id // Ensure we have the master service ID
          };
        }

        // If not found in master services, keep the selected service as-is
        return selectedService;
      });

      // Only update if the services actually changed
      const servicesChanged = validServices.length !== formData.step5.additionalServices.length ||
        validServices.some((service, index) => {
          const original = formData.step5.additionalServices[index];
          const originalName = original?.name || original?.service_name;
          const newName = service?.name || service?.service_name;
          return !original || newName !== originalName || service.category !== original.category;
        });

      if (servicesChanged) {
        setFormData(prev => ({
          ...prev,
          step5: {
            additionalServices: validServices
          }
        }));
      }
    }
  }, [services]); // Only depend on services, not formData.step5.additionalServices

  // Load drivers when toggle is clicked
  const loadDrivers = async () => {
    if (drivers.length > 0) {
      setShowDriverList(!showDriverList);
      return;
    }
    try {
      setLoadingDrivers(true);
      const dbDrivers = await DatabaseService.getDrivers();
      setDrivers(dbDrivers);
      setShowDriverList(true);
    } catch (err) {
      console.error('Error loading drivers:', err);
      setDrivers([]);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const servicesEqual = (master: any, selected: any) => {
    if (!master || !selected) return false;
    const masterId = master.id;
    const selId = selected.id || selected.originalServiceId || selected.service_id;
    const masterName = master.name || master.service_name;
    const selName = selected.name || selected.service_name;

    if (masterId && selId && masterId === selId) return true;
    if (masterName && selName && masterName === selName) return true;
    return false;
  };

  const toggleService = (service: any) => {
    const currentServices = formData.step5?.additionalServices || [];
    const isSelected = currentServices.some(s => servicesEqual(service, s) || servicesEqual(s, service));

    if (isSelected) {
      setFormData(prev => ({
        ...prev,
        step5: {
          additionalServices: currentServices.filter(s => !(servicesEqual(s, service) || servicesEqual(service, s)))
        }
      }));
    } else {
      // Add the service with the original service ID for reference
      const serviceToAdd = {
        ...service,
        originalServiceId: service.id // Keep reference to original service
      };
      setFormData(prev => ({
        ...prev,
        step5: {
          additionalServices: [...currentServices, serviceToAdd]
        }
      }));
    }
  };

  const createNewService = async () => {
    if (newService.name && newService.price > 0) {
      try {
        const created = await DatabaseService.createService({
          category: newService.category,
          name: newService.name,
          description: newService.description,
          price: newService.price,
        });

        setServices(prev => [...prev, created]);
        toggleService(created);

        setNewService({
          name: '',
          price: 0,
          description: '',
          category: 'service'
        });
        setShowNewServiceForm(false);
      } catch (err) {
        console.error('Error creating service:', err);
        alert(lang === 'fr' ? 'Erreur lors de la création du service' : 'خطأ في إنشاء الخدمة');
      }
    }
  };

  const deleteService = async (serviceId: string) => {
    setDeleteConfirmation({ show: true, serviceId, serviceName: services.find(s => s.id === serviceId)?.name || '' });
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation.serviceId) return;

    try {
      await DatabaseService.deleteService(deleteConfirmation.serviceId);
      setServices(prev => prev.filter(s => s.id !== deleteConfirmation.serviceId));
      
      // Remove from selected services if it was selected
      const currentServices = formData.step5?.additionalServices || [];
      if (currentServices.some(s => s.id === deleteConfirmation.serviceId)) {
        setFormData(prev => ({
          ...prev,
          step5: {
            additionalServices: currentServices.filter(s => s.id !== deleteConfirmation.serviceId)
          }
        }));
      }

      setDeleteConfirmation({ show: false, serviceId: null, serviceName: '' });
    } catch (err) {
      console.error('Error deleting service:', err);
      alert(lang === 'fr' ? 'Erreur lors de la suppression du service' : 'خطأ في حذف الخدمة');
      setDeleteConfirmation({ show: false, serviceId: null, serviceName: '' });
    }
  };

  return (
    <div className="space-y-8">
      <h3 className="text-2xl font-black text-slate-900">
        🛠️ {lang === 'fr' ? 'Services Supplémentaires' : 'الخدمات الإضافية'}
      </h3>

      {/* Add New Service Button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowNewServiceForm(true)}
          className="btn-saas-primary"
        >
          <Plus className="w-4 h-4 inline mr-2" />
          {lang === 'fr' ? 'Créer un Service' : 'إنشاء خدمة'}
        </button>
      </div>

      {/* Loading State */}
      {loadingServices ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-saas-primary-via"></div>
        </div>
      ) : services.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl opacity-30 mb-4">🛠️</div>
          <p className="text-saas-text-muted font-semibold">
            {lang === 'fr' ? 'Aucun service disponible' : 'لا توجد خدمات متاحة'}
          </p>
        </div>
      ) : (
        /* Available Services */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((service) => {
            const isSelected = formData.step5?.additionalServices?.some(s => 
              servicesEqual(service, s) || servicesEqual(s, service)
            );

            return (
              <motion.div
                key={service.id}
                onClick={() => toggleService(service)}
                whileHover={{ scale: 1.02 }}
                className={`border-2 rounded-2xl p-6 cursor-pointer transition-all group relative ${
                  isSelected
                    ? 'border-green-500 bg-green-50 shadow-lg'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Delete Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteService(service.id);
                  }}
                  className="absolute bottom-3 right-3 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                  title={lang === 'fr' ? 'Supprimer ce service' : 'حذف هذه الخدمة'}
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-bold text-lg text-slate-900">{service.name}</h4>
                    <p className="text-slate-600 text-sm mb-2">{service.description}</p>
                    <p className="font-bold text-green-700">{service.price.toLocaleString()} DA</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'border-green-500 bg-green-500' : 'border-slate-300'
                  }`}>
                    {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Chauffeur Selection */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
        <h4 className="text-lg font-black text-blue-900 mb-4">
          🚗 {lang === 'fr' ? 'Chauffeur (Optionnel)' : 'السائق (اختياري)'}
        </h4>

        <div className="flex items-center justify-between mb-4">
          <span className="font-bold text-blue-900">
            {lang === 'fr' ? 'Activer le chauffeur' : 'تفعيل السائق'}
          </span>
          <button
            onClick={loadDrivers}
            disabled={loadingDrivers}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
              selectedDriver ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                selectedDriver ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Driver List */}
        {showDriverList && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 mt-4 pt-4 border-t border-blue-200"
          >
            {loadingDrivers ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : drivers.length === 0 ? (
              <p className="text-blue-700 text-center py-4">
                {lang === 'fr' ? 'Aucun chauffeur disponible' : 'لا توجد سائقين متاحين'}
              </p>
            ) : (
              <div className="space-y-2">
                {drivers.map((driver) => (
                  <div
                    key={driver.id}
                    onClick={() => {
                      setSelectedDriver(driver);
                      setShowDriverList(false);
                    }}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedDriver?.id === driver.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        {driver.fullName.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold">{driver.fullName}</p>
                        <p className="text-slate-600 text-sm">📱 {driver.phone}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Selected Driver */}
        {selectedDriver && (
          <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-lg">
                {selectedDriver.fullName.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-bold text-lg">{selectedDriver.fullName}</p>
                <p className="text-blue-700">📱 {selectedDriver.phone}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Caution Amount */}
      {selectedDriver && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200">
          <label className="block font-bold text-yellow-900 mb-2">
            💰 {lang === 'fr' ? 'Caution Requise (DA)' : 'الضمان المطلوب (دج)'}
          </label>
          <input
            type="number"
            value={driverCaution}
            onChange={(e) => setDriverCaution(Number(e.target.value))}
            placeholder="0"
            className="w-full p-3 border border-yellow-200 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Selected Services Summary */}
      {formData.step5?.additionalServices && formData.step5.additionalServices.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
          <h4 className="text-lg font-black text-blue-900 mb-4">
            🛒 {lang === 'fr' ? 'Services Sélectionnés' : 'الخدمات المختارة'}
          </h4>
          <div className="space-y-2">
            {formData.step5.additionalServices.map((service) => (
              <div key={service.id} className="flex justify-between items-center">
                <span className="font-bold">{service.name}</span>
                <span className="font-bold text-blue-700">{service.price.toLocaleString()} DA</span>
              </div>
            ))}
            {selectedDriver && driverCaution > 0 && (
              <div className="flex justify-between items-center">
                <span className="font-bold">💰 {lang === 'fr' ? 'Caution Chauffeur' : 'ضمان السائق'}</span>
                <span className="font-bold text-blue-700">{driverCaution.toLocaleString()} DA</span>
              </div>
            )}
            <div className="border-t border-blue-300 pt-2 mt-4">
              <div className="flex justify-between items-center text-lg font-black">
                <span>{lang === 'fr' ? 'Total Suppléments' : 'إجمالي الملاحق'}</span>
                <span>
                  {(
                    formData.step5.additionalServices.reduce((sum, s) => sum + s.price, 0) +
                    (selectedDriver && driverCaution > 0 ? driverCaution : 0)
                  ).toLocaleString()} DA
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Service Modal */}
      <AnimatePresence>
        {showNewServiceForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fx-overlay p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fx-modal sm:max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-xl font-black text-slate-900 mb-6">
                ➕ {lang === 'fr' ? 'Créer un Service' : 'إنشاء خدمة'}
              </h3>

              <div className="space-y-6">
                {/* Service Category */}
                <div>
                  <label className="block font-bold text-slate-900 mb-2">
                    📂 {lang === 'fr' ? 'Catégorie' : 'الفئة'}
                  </label>
                  <select
                    value={newService.category}
                    onChange={(e) => setNewService(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="service">🛠️ {lang === 'fr' ? 'Service' : 'خدمة'}</option>
                    <option value="equipment">🔧 {lang === 'fr' ? 'Équipement' : 'معدات'}</option>
                    <option value="insurance">🛡️ {lang === 'fr' ? 'Assurance' : 'تأمين'}</option>
                    <option value="decoration">🎉 {lang === 'fr' ? 'Décoration' : 'ديكور'}</option>
                  </select>
                </div>

                {/* Service Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    placeholder={lang === 'fr' ? 'Nom du service' : 'اسم الخدمة'}
                    value={newService.name}
                    onChange={(e) => setNewService(prev => ({ ...prev, name: e.target.value }))}
                    className="p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder={lang === 'fr' ? 'Prix (DA)' : 'السعر (دج)'}
                    value={newService.price || ''}
                    onChange={(e) => setNewService(prev => ({ ...prev, price: Number(e.target.value) }))}
                    className="p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <textarea
                  placeholder={lang === 'fr' ? 'Description du service (optionnel)' : 'وصف الخدمة (اختياري)'}
                  value={newService.description}
                  onChange={(e) => setNewService(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowNewServiceForm(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg"
                >
                  {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                </button>
                <button
                  onClick={createNewService}
                  disabled={!newService.name || newService.price <= 0}
                  className="flex-1 btn-saas-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:translate-y-0"
                >
                  {lang === 'fr' ? 'Créer Service' : 'إنشاء الخدمة'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-red-200"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-xl font-black text-slate-900 text-center mb-2">
              {lang === 'fr' ? 'Confirmer la suppression' : 'تأكيد الحذف'}
            </h3>
            <p className="text-slate-600 text-center mb-6">
              {lang === 'fr' 
                ? `Êtes-vous sûr de vouloir supprimer le service "${deleteConfirmation.serviceName}"?` 
                : `هل أنت متأكد من حذف "${deleteConfirmation.serviceName}"?`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmation({ show: false, serviceId: null, serviceName: '' })}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-900 rounded-lg font-bold hover:bg-slate-50 transition-colors"
              >
                {lang === 'fr' ? 'Annuler' : 'إلغاء'}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-4 h-4" />
                {lang === 'fr' ? 'Supprimer' : 'حذف'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

// Step 6: Final Pricing
export const Step6FinalPricing: React.FC<{
  lang: Language;
  formData: ReservationWizardData;
  setFormData: React.Dispatch<React.SetStateAction<ReservationWizardData>>;
  inspectionMode?: boolean;
  initialData?: Partial<ReservationDetails>;
  agencies: any[];
  // When true, hide the client information section (used when this step is shown
  // before the client has been selected in the alternative flow).
  hideClientInfo?: boolean;
}> = ({ lang, formData, setFormData, inspectionMode, initialData, agencies, hideClientInfo = false }) => {
  const [tvaEnabled, setTvaEnabled] = useState(false);
  const [tvaRate, setTvaRate] = useState(19); // Default TVA rate
  const [paymentNotes, setPaymentNotes] = useState('');
  // Total forcé par l'agence. '' ⇒ on suit le total calculé (pas de case à cocher).
  const [manualTotal, setManualTotal] = useState<number | ''>('');
  const [cautionEnabled, setCautionEnabled] = useState(true);
  const [editedDeposit, setEditedDeposit] = useState<number | ''>('');

  // Devise dans laquelle le client règle la location.
  const [paymentCurrency, setPaymentCurrency] = useState<Currency>('DZD');
  // Acompte saisi par l'agence, exprimé dans `paymentCurrency`.
  // '' ⇒ pas encore touché : l'acompte suit le total (le client règle la totalité).
  const [advanceInput, setAdvanceInput] = useState<number | ''>('');

  // Multi-currency caution states
  const [cautionCurrency, setCautionCurrency] = useState<'DZD' | 'EUR'>('DZD');
  const [euroAmount, setEuroAmount] = useState<number | ''>('');
  // Peut être vidé pendant la saisie, d'où le '' — la valeur est renormalisée à l'enregistrement.
  // Ce taux sert à la fois à la caution et à la conversion du total.
  const [euroRate, setEuroRate] = useState<number | ''>(DEFAULT_EUR_RATE);
  // Tant que l'agence n'a pas fixé son taux, on suit celui déduit du véhicule.
  // Une saisie manuelle (ou un taux déjà enregistré) fige la valeur.
  const [rateTouched, setRateTouched] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState<number | ''>(formData.step6?.deliveryFee ?? 0);

  // Assurance Serenity : l'éditeur a été retiré de l'étape paiement, mais la valeur
  // enregistrée est conservée telle quelle pour les réservations existantes.
  const [assuranceEnabled, setAssuranceEnabled] = useState(false);
  const [assurancePercentage, setAssurancePercentage] = useState<number | ''>('');

  const hasInitialized = React.useRef(false);

  // TVA rates options
  const tvaRates = [0, 9, 19, 21];

  // Log on component mount
  useEffect(() => {
    return () => {
    };
  }, []);

  // Initialize from existing step6 data (only once per reservation)
  useEffect(() => {
    // Reset initialization flag if formData.id changes (different reservation being edited)
    if ((formData as any).id && hasInitialized.current) {
      hasInitialized.current = false;
    }
    
    if (!hasInitialized.current && formData.step6) {
      hasInitialized.current = true;
      setTvaEnabled(formData.step6.tvaApplied || false);
      setTvaRate(19); // Default
      setPaymentNotes(formData.step6.paymentNotes || '');

      // Devise de règlement + total forcé (le total forcé est stocké en DZD).
      const savedPaymentCurrency: Currency =
        (formData.step6 as any).paymentCurrency === 'EUR' ? 'EUR' : 'DZD';
      setPaymentCurrency(savedPaymentCurrency);

      const savedRate = (formData.step6 as any).euroRate || DEFAULT_EUR_RATE;
      if (formData.step6.isManualTotal && formData.step6.totalPrice) {
        setManualTotal(fromDzd(Number(formData.step6.totalPrice), savedPaymentCurrency, savedRate));
      } else {
        setManualTotal('');
      }

      // L'acompte est stocké en DZD ; on le réaffiche dans la devise de règlement.
      const savedAdvance = formData.step6.advancePayment;
      setAdvanceInput(
        savedAdvance === undefined || savedAdvance === null || savedAdvance === 0
          ? ''
          : fromDzd(Number(savedAdvance), savedPaymentCurrency, savedRate)
      );

      // Initialize currency fields
      const savedCurrency = (formData.step6 as any).cautionCurrency || 'DZD';
      const savedEuroAmount = (formData.step6 as any).euroAmount || '';
      const savedEuroRate = savedRate;
      const savedCautionDzd = (formData.step6 as any).caution_amount_dzd;
      
      console.log('💾 STEP6 INITIALIZATION:');
      console.log('   ├─ cautionCurrency:', savedCurrency);
      console.log('   ├─ euroAmount:', savedEuroAmount);
      console.log('   ├─ euroRate:', savedEuroRate);
      console.log('   ├─ caution_amount_dzd:', savedCautionDzd);
      console.log('   ├─ assuranceEnabled:', (formData.step6 as any).assuranceEnabled);
      console.log('   └─ assurancePercentage:', (formData.step6 as any).assurancePercentage);
      
      setCautionCurrency(savedCurrency);
      setEuroAmount(savedEuroAmount);
      setEuroRate(savedEuroRate);
      // Un taux déjà négocié fait foi : il ne doit pas être écrasé par celui du véhicule.
      if ((formData.step6 as any).euroRate) setRateTouched(true);
      
      // Initialize editedDeposit from saved caution_amount_dzd if it differs from default
      if (savedCautionDzd && savedCautionDzd !== deposit) {
        console.log('💾 Setting editedDeposit from saved caution_amount_dzd:', savedCautionDzd);
        setEditedDeposit(savedCautionDzd);
      } else if (savedCautionDzd) {
        setEditedDeposit(savedCautionDzd);
      }
      
      // Initialize assurance fields
      setAssuranceEnabled((formData.step6 as any).assuranceEnabled || false);
      setAssurancePercentage((formData.step6 as any).assurancePercentage || '');
    }
  }, [(formData as any).id]); // Reinitialize when editing a different reservation

  // Initialize editedDeposit from formData or selectedCar
  useEffect(() => {
    if (formData.deposit) {
      setEditedDeposit(formData.deposit);
    } else if (formData.step2?.selectedCar) {
      setEditedDeposit(formData.step2.selectedCar.deposit || 0);
    } else if ((formData as any).car) {
      setEditedDeposit((formData as any).car.deposit || 0);
    }
  }, [formData.step2?.selectedCar, (formData as any).car]);

  // Auto-calculate DZD from EUR
  useEffect(() => {
    if (cautionCurrency === 'EUR' && euroAmount && euroRate) {
      const dzd = Math.round(Number(euroAmount) * Number(euroRate));
      setEditedDeposit(dzd);
    }
  }, [cautionCurrency, euroAmount, euroRate]);

  // Calculate pricing
  // Get car data from either step2 (new flow) or car (existing reservation/inspection)
  const selectedCar = formData.step2?.selectedCar || (formData as any).car;
  
  const days = formData.step1?.departureDate && formData.step1?.returnDate
    ? Math.ceil((new Date(formData.step1.returnDate).getTime() - new Date(formData.step1.departureDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // ── Taux de change déduit du véhicule ───────────────────────────────────────
  // Une agence qui annonce « 5 000 DA ou 35 € la journée » a implicitement convenu
  // d'un taux. On l'applique tant que l'utilisateur n'a pas saisi le sien, sinon le
  // total en euros contredirait les tarifs affichés sur la fiche du véhicule.
  const suggestedRate = impliedEurRate(selectedCar);
  useEffect(() => {
    if (rateTouched || suggestedRate === null) return;
    setEuroRate(suggestedRate);
  }, [suggestedRate, rateTouched]);

  // ── Tarifs unitaires du véhicule dans la devise de règlement ────────────────
  // En EUR : tarifs euros du véhicule s'ils existent, sinon conversion au taux courant.
  const rate = safeRate(euroRate);
  const dzdUnit = carUnitPrices(selectedCar, 'DZD', rate);
  const eurUnit = carUnitPrices(selectedCar, 'EUR', rate);
  const unit = paymentCurrency === 'EUR' ? eurUnit : dzdUnit;
  /** Formate un montant déjà exprimé dans la devise de règlement. */
  const fmt = (amount: number) => formatMoney(amount, paymentCurrency);
  /** Formate un montant stocké en DZD, converti vers la devise de règlement. */
  const fmtDzd = (dzd: number) => fmt(fromDzd(dzd, paymentCurrency, rate));

  let calculatedBasePrice = 0;
  let weeklyPrice = 0;
  let monthlyPrice = 0;
  let remainingPrice = 0;
  // Always define weeks and remainingDays for UI
  let weeks = 0;
  let remainingDays = 0;
  if (days === 7) {
    calculatedBasePrice = unit.week;
    weeklyPrice = calculatedBasePrice;
    weeks = 1;
    remainingDays = 0;
  } else if (days === 30) {
    calculatedBasePrice = unit.month;
    monthlyPrice = calculatedBasePrice;
    weeks = 0;
    remainingDays = 0;
  } else {
    weeks = Math.floor(days / 7);
    remainingDays = days % 7;
    weeklyPrice = unit.week * weeks;
    remainingPrice = unit.day * remainingDays;
    calculatedBasePrice = weeklyPrice + remainingPrice;
  }
  calculatedBasePrice = roundIn(calculatedBasePrice, paymentCurrency);

  // Les extras sont saisis en dinars : on les convertit vers la devise de règlement.
  const servicesTotalDzd = formData.step5?.additionalServices?.reduce((sum, s) => sum + s.price, 0) || 0;
  const servicesTotal = fromDzd(servicesTotalDzd, paymentCurrency, rate);
  // Assurance de protection : prix/jour × nombre de jours
  const protectionAssuranceCostDzd = formData.protectionAssurance
    ? Math.round((formData.protectionAssurance.pricePerDay || 0) * days)
    : 0;
  const protectionAssuranceCost = fromDzd(protectionAssuranceCostDzd, paymentCurrency, rate);

  const subtotal = calculatedBasePrice + servicesTotal + protectionAssuranceCost;
  const tvaAmount = roundIn(tvaEnabled ? (subtotal * tvaRate) / 100 : 0, paymentCurrency);
  // Les frais de livraison ne sont facturés au client qu'en dessous du seuil de
  // 10 jours ; au-delà ils sont à la charge du propriétaire du véhicule.
  const deliveryFeeAmountDzd = deliveryFee === '' ? 0 : Number(deliveryFee);
  const deliveryFeeAmount = fromDzd(deliveryFeeAmountDzd, paymentCurrency, rate);
  const clientDeliveryFee = getDeliveryFeePayer(days) === 'client' ? deliveryFeeAmount : 0;

  /** Total calculé, dans la devise de règlement. */
  const computedPrice = Math.max(0, roundIn(subtotal + tvaAmount + clientDeliveryFee, paymentCurrency));
  /** `''` ⇒ l'agence n'a pas forcé le total : il suit le calcul. */
  const isManualTotal = manualTotal !== '';
  /** Total retenu, dans la devise de règlement. */
  const totalPrice = isManualTotal ? Math.max(0, Number(manualTotal)) : computedPrice;
  /** Le DZD reste la devise de référence en base. */
  const totalPriceDzd = toDzd(totalPrice, paymentCurrency, rate);

  const deposit = editedDeposit !== '' ? Number(editedDeposit) : (selectedCar?.deposit || 0);

  // ── Acompte / reste à payer, dans la devise de règlement ────────────────────
  // Par défaut le client règle la totalité : l'acompte suit le total tant que
  // l'agence n'a pas saisi de montant.
  const advancePayment = advanceInput === '' ? totalPrice : Math.max(0, Number(advanceInput));
  const remainingPayment = Math.max(0, roundIn(totalPrice - advancePayment, paymentCurrency));
  const advancePaymentDzd = toDzd(advancePayment, paymentCurrency, rate);
  const remainingPaymentDzd = Math.max(0, totalPriceDzd - advancePaymentDzd);

  // Assurance Serenity : conservée pour les réservations déjà enregistrées.
  const assuranceAmount = assuranceEnabled && assurancePercentage !== ''
    ? Math.round(totalPriceDzd * (Number(assurancePercentage) / 100))
    : 0;
  const finalTotal = totalPriceDzd + assuranceAmount;

  /** Bascule de devise : les montants déjà saisis sont convertis, pas réinterprétés. */
  const switchPaymentCurrency = (next: Currency) => {
    if (next === paymentCurrency) return;
    const convert = (v: number) => roundIn(
      next === 'EUR' ? Number(v) / rate : Number(v) * rate,
      next,
    );
    if (manualTotal !== '') setManualTotal(convert(Number(manualTotal)));
    if (advanceInput !== '') setAdvanceInput(convert(Number(advanceInput)));
    setPaymentCurrency(next);
  };

  // Console logging for debugging
  React.useEffect(() => {
  }, [days, weeks, remainingDays, calculatedBasePrice, servicesTotal, tvaAmount, computedPrice, totalPrice, deposit, editedDeposit, tvaEnabled, tvaRate, isManualTotal, manualTotal]);

  // Update formData with values (manual override takes precedence)
  React.useEffect(() => {
    setFormData(prev => ({
      ...prev,
      step1: {
        ...prev.step1,
        departureDate: formData.step1?.departureDate || prev.step1?.departureDate,
        returnDate: formData.step1?.returnDate || prev.step1?.returnDate
      },
      step6: {
        ...prev.step6,
        // Le DZD reste la devise de référence stockée en base.
        totalPrice: totalPriceDzd,
        isManualTotal: isManualTotal,
        manualTotal: manualTotal,
        tvaApplied: tvaEnabled,
        tvaAmount: toDzd(tvaAmount, paymentCurrency, rate),
        deliveryFee: deliveryFeeAmountDzd,
        additionalFees: prev.step6?.additionalFees ?? prev.additionalFees,
        advancePayment: advancePaymentDzd,
        remainingPayment: remainingPaymentDzd,
        paymentNotes: paymentNotes,
        cautionEnabled: cautionEnabled,
        // Devise de règlement de la location + montants dans cette devise
        paymentCurrency: paymentCurrency,
        totalPriceEur: paymentCurrency === 'EUR' ? totalPrice : undefined,
        advancePaymentEur: paymentCurrency === 'EUR' ? advancePayment : undefined,
        remainingPaymentEur: paymentCurrency === 'EUR' ? remainingPayment : undefined,
        // Multi-currency caution fields
        cautionCurrency: cautionCurrency,
        euroAmount: euroAmount,
        // Un champ vidé pendant la saisie ne doit pas écraser le taux enregistré.
        euroRate: euroRate === '' ? undefined : euroRate,
        // Assurance fields
        assuranceEnabled: assuranceEnabled,
        assurancePercentage: assurancePercentage,
        assuranceAmount: assuranceAmount,
        finalTotal: finalTotal,
        // Caution amount in DZD for database
        caution_amount_dzd: cautionCurrency === 'EUR' && euroAmount && euroRate
          ? Math.round(Number(euroAmount) * Number(euroRate))
          : (editedDeposit !== '' ? Number(editedDeposit) : deposit),
      },
      deposit: deposit,
      totalPrice: totalPriceDzd
    }));
  }, [totalPriceDzd, isManualTotal, manualTotal, tvaEnabled, tvaAmount, deliveryFeeAmountDzd, cautionEnabled, cautionCurrency, euroAmount, euroRate, assuranceEnabled, assurancePercentage, assuranceAmount, finalTotal, deposit, editedDeposit, paymentCurrency, advancePaymentDzd, remainingPaymentDzd, paymentNotes]);

  return (
    <div className="space-y-8">
      {/* ── En-tête : titre + devise de règlement + total ─────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h3 className="text-2xl font-black">
              💰 {lang === 'fr' ? 'Récapitulatif de la Réservation' : 'ملخص الحجز'}
            </h3>
            <p className="text-slate-300 text-sm mt-1">
              {lang === 'fr'
                ? `${days} jour(s) · ${selectedCar ? `${selectedCar.brand} ${selectedCar.model}` : 'Aucun véhicule'}`
                : `${days} يوم · ${selectedCar ? `${selectedCar.brand} ${selectedCar.model}` : 'لا توجد مركبة'}`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Sélecteur de devise */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                {lang === 'fr' ? 'Le client paie en' : 'يدفع العميل بـ'}
              </p>
              <div className="inline-flex rounded-xl bg-slate-700/60 p-1">
                {(['DZD', 'EUR'] as Currency[]).map(cur => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => switchPaymentCurrency(cur)}
                    className={`px-4 py-2 rounded-lg text-sm font-black transition-all ${
                      paymentCurrency === cur
                        ? 'bg-white text-slate-900 shadow'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {cur === 'DZD' ? 'DZD (DA)' : 'EUR (€)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Total courant */}
            <div className="sm:border-s sm:border-slate-700 sm:ps-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                {lang === 'fr' ? 'Total location' : 'إجمالي التأجير'}
              </p>
              <p className="text-3xl font-black text-emerald-400 leading-none">{fmt(totalPrice)}</p>
              {paymentCurrency === 'EUR' && (
                <p className="text-[11px] text-slate-400 mt-1">
                  ≈ {formatMoney(totalPriceDzd, 'DZD')} · {rate} DA/€
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Taux de change, visible seulement quand il sert */}
        {paymentCurrency === 'EUR' && (
          <div className="mt-5 pt-4 border-t border-slate-700 flex flex-wrap items-center gap-3">
            <label className="text-sm font-bold text-slate-300">
              {lang === 'fr' ? 'Taux de change' : 'سعر الصرف'}
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              value={euroRate === '' ? '' : euroRate}
              onChange={(e) => {
                setRateTouched(true);
                const v = e.target.value.trim();
                if (v === '') { setEuroRate(''); return; }
                const n = parseFloat(v);
                if (!isNaN(n) && n > 0) setEuroRate(n);
              }}
              className="w-28 p-2 rounded-lg bg-slate-700 border border-slate-600 text-white text-right font-bold focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              placeholder={String(DEFAULT_EUR_RATE)}
            />
            <span className="text-sm font-bold text-slate-300">DA / €</span>

            {/* Taux déduit des tarifs du véhicule : appliqué d'office, réarmable après édition. */}
            {suggestedRate !== null && (
              rateTouched && euroRate !== suggestedRate ? (
                <button
                  type="button"
                  onClick={() => { setRateTouched(false); setEuroRate(suggestedRate); }}
                  className="px-3 py-2 rounded-lg bg-slate-700 border border-slate-600 text-emerald-300 text-xs font-bold hover:bg-slate-600 transition-colors"
                >
                  ↺ {lang === 'fr' ? `Taux du véhicule (${suggestedRate})` : `سعر المركبة (${suggestedRate})`}
                </button>
              ) : (
                <span className="px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-300 text-[11px] font-bold">
                  {lang === 'fr' ? 'Déduit des tarifs du véhicule' : 'مستنتج من أسعار المركبة'}
                </span>
              )
            )}

            <span className="text-xs text-slate-400 ms-auto">
              {lang === 'fr'
                ? "Sert aussi à convertir services, livraison et TVA saisis en dinars."
                : 'يُستخدم أيضًا لتحويل الخدمات والتوصيل والضريبة المُدخلة بالدينار.'}
            </span>
          </div>
        )}
      </div>

      {/* CLIENT INFORMATION SECTION */}
      {!hideClientInfo && formData.step4?.selectedClient && (
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-6 border-2 border-orange-200">
          <h4 className="text-lg font-black text-orange-900 mb-4">👤 {lang === 'fr' ? 'Informations Client' : 'معلومات العميل'}</h4>
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Client Image */}
            <div className="flex-shrink-0 w-32 h-32 rounded-full overflow-hidden border-4 border-orange-300 shadow-lg bg-orange-100 flex items-center justify-center">
              {formData.step4.selectedClient.profilePhoto ? (
                <img
                  src={formData.step4.selectedClient.profilePhoto}
                  alt={`${formData.step4.selectedClient.firstName} ${formData.step4.selectedClient.lastName}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-5xl">👤</span>
              )}
            </div>
            {/* Client Details */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-bold text-orange-700 mb-1">{lang === 'fr' ? 'Nom Complet' : 'الاسم الكامل'}</p>
                <p className="text-lg font-bold text-orange-900">{formData.step4.selectedClient.firstName} {formData.step4.selectedClient.lastName}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-orange-700 mb-1">{lang === 'fr' ? 'Téléphone' : 'الهاتف'}</p>
                <p className="text-lg font-bold text-orange-900">{formData.step4.selectedClient.phone}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-orange-700 mb-1">{lang === 'fr' ? 'Email' : 'البريد الإلكتروني'}</p>
                <p className="text-lg text-orange-900">{formData.step4.selectedClient.email || '-'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm font-bold text-orange-700 mb-1">{lang === 'fr' ? 'Adresse' : 'العنوان'}</p>
                <p className="text-lg text-orange-900">{formData.step4.selectedClient.completeAddress || formData.step4.selectedClient.wilaya || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAR INFORMATION SECTION — `selectedCar` couvre aussi le mode inspection,
          où le véhicule vient de la réservation et non de l'étape 2. */}
      {selectedCar ? (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border-2 border-blue-200">
          <h4 className="text-lg font-black text-blue-900 mb-4">🚗 {lang === 'fr' ? 'Informations du Véhicule' : 'معلومات المركبة'}</h4>
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Car Image */}
            <div className="flex-shrink-0">
              <img
                src={selectedCar.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
                alt={`${selectedCar.brand} ${selectedCar.model}`}
                className="w-40 h-32 rounded-lg object-cover border-3 border-blue-300 shadow-lg"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Car Details */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Modèle' : 'الموديل'}</p>
                <p className="text-lg font-bold text-blue-900">{selectedCar.brand} {selectedCar.model}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Immatriculation' : 'رقم التسجيل'}</p>
                <p className="text-lg font-bold text-blue-900">{selectedCar.registration}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Couleur' : 'اللون'}</p>
                <p className="text-lg text-blue-900">{selectedCar.color}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Carburant' : 'الوقود'}</p>
                <p className="text-lg text-blue-900">⛽ {selectedCar.energy || '-'}</p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Caution' : 'الضمان'}</p>
                <p className="text-lg font-bold text-blue-900">
                  {formatMoney(dzdUnit.deposit, 'DZD')}
                  <span className="ms-2 text-sm font-bold text-amber-700">
                    {selectedCar.depositEur === undefined && '≈ '}
                    {formatMoney(eurUnit.deposit, 'EUR')}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm font-bold text-blue-700 mb-1">{lang === 'fr' ? 'Transmission' : 'ناقل الحركة'}</p>
                <p className="text-lg text-blue-900">{selectedCar.transmission || '-'}</p>
              </div>
            </div>
          </div>

          {/* Tarifs de la fiche véhicule — DZD et EUR. La devise de règlement est mise en avant. */}
          <div className="mt-6 pt-6 border-t border-blue-200">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-500 mb-3">
              {lang === 'fr' ? 'Tarifs de la fiche véhicule' : 'أسعار بطاقة المركبة'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { label: { fr: 'Prix/Jour', ar: 'السعر/يوم' }, dzd: dzdUnit.day, eur: eurUnit.day, explicit: selectedCar.priceDayEur !== undefined },
                { label: { fr: 'Prix/Semaine', ar: 'السعر/أسبوع' }, dzd: dzdUnit.week, eur: eurUnit.week, explicit: selectedCar.priceWeekEur !== undefined },
                { label: { fr: 'Prix/Mois', ar: 'السعر/شهر' }, dzd: dzdUnit.month, eur: eurUnit.month, explicit: selectedCar.priceMonthEur !== undefined },
              ]).map((row, i) => (
                <div
                  key={i}
                  className="text-center rounded-xl bg-white/70 border border-blue-200 p-3"
                >
                  <p className="text-sm text-blue-600 font-bold">{row.label[lang]}</p>
                  <p className={`text-2xl font-black ${paymentCurrency === 'DZD' ? 'text-blue-900' : 'text-blue-400'}`}>
                    {formatMoney(row.dzd, 'DZD')}
                  </p>
                  <p
                    className={`text-base font-black mt-0.5 ${paymentCurrency === 'EUR' ? 'text-amber-700' : 'text-amber-500/70'}`}
                    title={row.explicit
                      ? (lang === 'fr' ? 'Tarif en euros défini pour ce véhicule' : 'سعر باليورو محدد لهذه المركبة')
                      : (lang === 'fr' ? `Converti au taux de ${rate} DA/€` : `محول بسعر ${rate} د.ج/€`)}
                  >
                    {!row.explicit && '≈ '}{formatMoney(row.eur, 'EUR')}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-3">
              {lang === 'fr'
                ? '≈ signale un tarif converti au taux courant ; les autres sont ceux saisis sur la fiche du véhicule.'
                : '≈ يشير إلى سعر محوَّل بالسعر الحالي؛ الباقي مأخوذ من بطاقة المركبة.'}
            </p>
          </div>
        </div>
      ) : (
        // Sans véhicule, tous les montants de cette étape valent zéro : on le dit
        // plutôt que d'afficher un récapitulatif vide et trompeur.
        <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50 p-6 text-center">
          <span className="text-4xl block mb-2">🚗</span>
          <p className="font-black text-amber-900">
            {lang === 'fr' ? 'Aucun véhicule sélectionné' : 'لم يتم اختيار مركبة'}
          </p>
          <p className="text-sm font-bold text-amber-700 mt-1">
            {lang === 'fr'
              ? "Revenez à l'étape 2 : sans véhicule, les tarifs et le total restent à zéro."
              : 'ارجع إلى الخطوة 2: بدون مركبة، تبقى الأسعار والمجموع صفرًا.'}
          </p>
        </div>
      )}

      {/* RESERVATION DETAILS SECTION */}
      <div className="bg-slate-50 rounded-2xl p-6 border-2 border-slate-200">
        <h4 className="text-lg font-black text-slate-900 mb-4">📋 {lang === 'fr' ? 'Détails de la Réservation' : 'تفاصيل الحجز'}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-1">📅 {lang === 'fr' ? 'Date de Départ' : 'تاريخ المغادرة'}</p>
            <p className="text-lg font-bold text-slate-900">{formData.step1?.departureDate}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-1">📅 {lang === 'fr' ? 'Date de Retour' : 'تاريخ العودة'}</p>
            <p className="text-lg font-bold text-slate-900">{formData.step1?.returnDate}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-1">⏱️ {lang === 'fr' ? 'Durée' : 'المدة'}</p>
            <p className="text-lg font-bold text-slate-900">{days} {lang === 'fr' ? 'jours' : 'أيام'}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-2">📊 {lang === 'fr' ? 'Semaines/Jours (Éditable)' : 'أسابيع/أيام (قابل للتعديل)'}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">{lang === 'fr' ? 'Semaines' : 'أسابيع'}</label>
                <input
                  type="number"
                  min="0"
                  value={weeks}
                  onChange={(e) => {
                    const newWeeks = Number(e.target.value) || 0;
                    const newRemainingDays = remainingDays;
                    const totalNewDays = (newWeeks * 7) + newRemainingDays;
                    if (totalNewDays > 0 && formData.step1?.departureDate) {
                      const departure = new Date(formData.step1.departureDate);
                      const newReturn = new Date(departure);
                      newReturn.setDate(newReturn.getDate() + totalNewDays);
                      const returnDateStr = newReturn.toISOString().split('T')[0];
                      setFormData(prev => ({
                        ...prev,
                        step1: { ...prev.step1!, returnDate: returnDateStr }
                      }));
                    }
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-bold"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">{lang === 'fr' ? 'Jours' : 'أيام'}</label>
                <input
                  type="number"
                  min="0"
                  max="6"
                  value={remainingDays}
                  onChange={(e) => {
                    const newRemainingDays = Math.min(Number(e.target.value) || 0, 6);
                    const totalNewDays = (weeks * 7) + newRemainingDays;
                    if (totalNewDays > 0 && formData.step1?.departureDate) {
                      const departure = new Date(formData.step1.departureDate);
                      const newReturn = new Date(departure);
                      newReturn.setDate(newReturn.getDate() + totalNewDays);
                      const returnDateStr = newReturn.toISOString().split('T')[0];
                      setFormData(prev => ({
                        ...prev,
                        step1: { ...prev.step1!, returnDate: returnDateStr }
                      }));
                    }
                  }}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center font-bold"
                />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-1">📍 {lang === 'fr' ? 'Lieu de Départ' : 'مكان المغادرة'}</p>
            <p className="text-lg font-bold text-slate-900">{
              (() => {
                const agencyId = (inspectionMode && initialData && (initialData as any).status === 'accepted')
                  ? (initialData as any).departure_agency_id
                  : formData.step1?.departureAgencyId;

                if (agencyId) {
                  const agency = (agencies || []).find(a => a.id === agencyId);
                  return agency ? `${agency.name}${agency.address ? ' - ' + agency.address : ''}` : 'Agence non trouvée';
                }
                return formData.step1?.departureLocation || 'Non spécifié';
              })()
            }</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-bold text-slate-700 mb-1">📍 {lang === 'fr' ? 'Lieu de Retour' : 'مكان العودة'}</p>
            <p className="text-lg font-bold text-slate-900">{
              (() => {
                if (inspectionMode && initialData && (initialData as any).status === 'accepted') {
                  const agency = (agencies || []).find(a => a.id === (initialData as any).return_agency_id);
                  return agency ? `${agency.name}${agency.address ? ' - ' + agency.address : ''}` : 'Non spécifié';
                }
                // À défaut d'agence de retour distincte, c'est celle du départ.
                const agencyId = formData.step1?.returnAgencyId || formData.step1?.departureAgencyId;
                const agency = (agencies || []).find(a => a.id === agencyId);
                if (agency) return `${agency.name}${agency.address ? ' - ' + agency.address : ''}`;
                return formData.step1?.returnLocation || formData.step1?.departureLocation || 'Non spécifié';
              })()
            }</p>
          </div>
          {formData.step3?.selectedDriver && (
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <p className="text-sm font-bold text-slate-700 mb-1">🧑‍✈️ {lang === 'fr' ? 'Chauffeur' : 'السائق'}</p>
              <p className="text-lg font-bold text-slate-900">{formData.step3.selectedDriver.fullName}</p>
            </div>
          )}
        </div>
      </div>

          {/* Pricing Breakdown */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <h4 className="text-lg font-black text-slate-900 mb-6">
              💰 {lang === 'fr' ? 'Décomposition du Prix' : 'تفصيل السعر'}
            </h4>

            <div className="space-y-4">
              {/* Base Price Breakdown */}
              <div className="bg-slate-50 rounded-lg p-4">
                <h5 className="font-bold text-slate-900 mb-3">{lang === 'fr' ? 'Prix de Base du Véhicule' : 'سعر المركبة الأساسي'}</h5>
                <div className="space-y-2">
                  {days === 7 && (
                    <div className="flex justify-between items-center">
                      <span>1 {lang === 'fr' ? 'semaine' : 'أسبوع'} × {fmt(unit.week)}</span>
                      <span className="font-bold">{fmt(weeklyPrice)}</span>
                    </div>
                  )}
                  {days === 30 && (
                    <div className="flex justify-between items-center">
                      <span>1 {lang === 'fr' ? 'mois' : 'شهر'} × {fmt(unit.month)}</span>
                      <span className="font-bold">{fmt(monthlyPrice)}</span>
                    </div>
                  )}
                  {days !== 7 && days !== 30 && weeklyPrice > 0 && (
                    <div className="flex justify-between items-center">
                      <span>{Math.floor(days / 7)} {lang === 'fr' ? 'semaine(s)' : 'أسبوع'} × {fmt(unit.week)}</span>
                      <span className="font-bold">{fmt(weeklyPrice)}</span>
                    </div>
                  )}
                  {days !== 7 && days !== 30 && remainingPrice > 0 && (
                    <div className="flex justify-between items-center">
                      <span>{days % 7} {lang === 'fr' ? 'jour(s)' : 'يوم'} × {fmt(unit.day)}</span>
                      <span className="font-bold">{fmt(remainingPrice)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-t border-slate-300 pt-2 text-lg font-bold">
                    <span>{lang === 'fr' ? 'Sous-total Véhicule' : 'المجموع الفرعي للمركبة'}</span>
                    <span>{fmt(calculatedBasePrice)}</span>
                  </div>
                </div>
              </div>

          {/* Services */}
          {formData.step5?.additionalServices && formData.step5.additionalServices.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h5 className="font-bold text-blue-900 mb-3">{lang === 'fr' ? 'Services Supplémentaires' : 'الخدمات الإضافية'}</h5>
              <div className="space-y-2">
                {formData.step5.additionalServices.map((service) => (
                  <div key={service.id} className="flex justify-between items-center">
                    <span>{service.name}</span>
                    <span>{fmtDzd(service.price)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center border-t border-blue-300 pt-2 font-bold">
                  <span>{lang === 'fr' ? 'Total Services' : 'إجمالي الخدمات'}</span>
                  <span>{fmt(servicesTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Assurance de protection sélectionnée */}
          {formData.protectionAssurance && (
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <h5 className="font-bold text-red-900 mb-3 flex items-center gap-2">
                🛡️ {lang === 'fr' ? 'Assurance de Protection' : 'تأمين الحماية'}
              </h5>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold">{formData.protectionAssurance.name}</span>
                <span className="text-sm text-red-700">
                  {fmtDzd(formData.protectionAssurance.pricePerDay || 0)}/{lang === 'fr' ? 'j' : 'ي'} × {days}
                </span>
              </div>
              {formData.protectionAssurance.items && formData.protectionAssurance.items.length > 0 && (
                <div className="space-y-1 mb-2">
                  {formData.protectionAssurance.items.map((item) => (
                    <div key={item.linkId || item.itemId} className="flex items-center gap-2 text-sm">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${
                        item.status ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-700'
                      }`}>
                        {item.status ? '✓' : '✕'}
                      </span>
                      <span className={item.status ? 'text-slate-700' : 'text-slate-400 line-through'}>{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center border-t border-red-300 pt-2 font-bold">
                <span>{lang === 'fr' ? 'Total Assurance' : 'إجمالي التأمين'}</span>
                <span>{fmt(protectionAssuranceCost)}</span>
              </div>
            </div>
          )}

          {/* Frais de livraison — le payeur découle de la durée (règle des 10 jours) */}
          <DeliveryFeeField lang={lang} value={deliveryFee} onChange={setDeliveryFee} totalDays={days} />

          {/* TVA Section */}
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-bold text-yellow-900">{lang === 'fr' ? 'Taxe sur la Valeur Ajoutée (TVA)' : 'ضريبة القيمة المضافة (TVA)'}</h5>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={tvaEnabled}
                  onChange={(e) => setTvaEnabled(e.target.checked)}
                  className="w-4 h-4 text-yellow-600 border-yellow-300 rounded focus:ring-yellow-500"
                />
                <span className="font-bold text-yellow-900">{lang === 'fr' ? 'Appliquer TVA' : 'تطبيق TVA'}</span>
              </label>
            </div>

            {tvaEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold text-yellow-800 mb-2">
                    {lang === 'fr' ? 'Taux de TVA' : 'معدل TVA'}
                  </label>
                  <select
                    value={tvaRate}
                    onChange={(e) => setTvaRate(Number(e.target.value))}
                    className="w-full p-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  >
                    {tvaRates.map((rate) => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-between items-center text-lg font-bold text-yellow-900">
                  <span>TVA ({tvaRate}%)</span>
                  <span>{fmt(tvaAmount)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Final Total — toujours éditable, pas de case à cocher */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-5 border-2 border-green-200">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xl font-black text-green-900">
                  {lang === 'fr' ? 'TOTAL LOCATION' : 'إجمالي التأجير'}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  {isManualTotal
                    ? (lang === 'fr'
                        ? `Montant forcé — calculé : ${fmt(computedPrice)}`
                        : `مبلغ مُحدَّد يدويًا — المحسوب: ${fmt(computedPrice)}`)
                    : (lang === 'fr'
                        ? 'Calculé automatiquement — modifiable directement'
                        : 'محسوب تلقائيًا — قابل للتعديل مباشرة')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={paymentCurrency === 'EUR' ? '0.01' : '1'}
                    value={manualTotal === '' ? computedPrice : manualTotal}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value === '') { setManualTotal(''); return; }
                      const numValue = parseFloat(value);
                      if (!isNaN(numValue) && numValue >= 0) {
                        setManualTotal(roundIn(numValue, paymentCurrency));
                      }
                    }}
                    className={`w-44 ps-3 pe-10 py-3 rounded-xl text-right text-2xl font-black focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                      isManualTotal
                        ? 'border-2 border-amber-400 bg-amber-50 text-amber-900'
                        : 'border-2 border-green-300 bg-white text-green-900'
                    }`}
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-lg font-black text-green-700 pointer-events-none">
                    {currencySymbol(paymentCurrency)}
                  </span>
                </div>

                {isManualTotal && (
                  <button
                    type="button"
                    onClick={() => setManualTotal('')}
                    title={lang === 'fr' ? 'Revenir au total calculé' : 'العودة إلى المجموع المحسوب'}
                    className="px-3 py-3 rounded-xl bg-white border-2 border-green-300 text-green-800 font-black hover:bg-green-50 transition-colors"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-green-200 flex flex-wrap gap-x-6 gap-y-1 text-sm text-green-700">
              {paymentCurrency === 'EUR' && (
                <span>{lang === 'fr' ? 'Équivalent :' : 'المعادل:'} <span className="font-bold">{formatMoney(totalPriceDzd, 'DZD')}</span></span>
              )}
              {tvaEnabled && (
                <span>{lang === 'fr' ? 'Dont TVA :' : 'تشمل TVA:'} <span className="font-bold">{fmt(tvaAmount)}</span> ({tvaRate}%)</span>
              )}
            </div>
          </div>

          {/* Deposit with toggle and manual edit, only display if activated */}
          <div className="space-y-3 py-3 border-t border-slate-300">
            <label className="flex items-center gap-2 ml-4">
              <input
                type="checkbox"
                checked={cautionEnabled}
                onChange={(e) => setCautionEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-blue-300 rounded focus:ring-blue-500"
              />
              <span className="font-bold text-blue-700">{lang === 'fr' ? 'Activer Caution' : 'تفعيل الضمان'}</span>
            </label>
            {cautionEnabled && (
              <div className="ml-4 space-y-3">
                {/* Currency Selector */}
                <div className="flex gap-2 items-center">
                  <span className="font-bold text-blue-700">{lang === 'fr' ? 'Devise' : 'العملة'}: </span>
                  <select
                    value={cautionCurrency}
                    onChange={(e) => {
                      setCautionCurrency(e.target.value as 'DZD' | 'EUR');
                      if (e.target.value === 'DZD') {
                        setEuroAmount('');
                      } else {
                        setEditedDeposit('');
                      }
                    }}
                    className="p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold"
                  >
                    <option value="DZD">DZD (DA)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>

                {/* DZD Mode */}
                {cautionCurrency === 'DZD' && (
                  <div className="flex gap-2 items-center">
                    <span className="font-bold text-blue-700">{lang === 'fr' ? 'Caution (remboursable)' : 'الضمان (قابل للاسترداد)'}: </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editedDeposit === '' ? '' : editedDeposit}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === '') {
                          setEditedDeposit('');
                        } else {
                          const numValue = parseInt(value, 10);
                          if (!isNaN(numValue) && numValue >= 0) {
                            setEditedDeposit(numValue);
                          }
                        }
                      }}
                      className="w-32 p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right font-bold"
                      placeholder="0"
                    />
                    <span className="text-blue-700 font-bold">DA</span>
                  </div>
                )}

                {/* EUR Mode */}
                {cautionCurrency === 'EUR' && (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center">
                      <span className="font-bold text-blue-700">{lang === 'fr' ? 'Montant EUR' : 'المبلغ بالیورو'}: </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={euroAmount === '' ? '' : euroAmount}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          if (value === '') {
                            setEuroAmount('');
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue >= 0) {
                              setEuroAmount(numValue);
                            }
                          }
                        }}
                        className="w-32 p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right font-bold"
                        placeholder="0"
                      />
                      <span className="text-blue-700 font-bold">€</span>
                    </div>

                    <div className="flex gap-2 items-center">
                      <span className="font-bold text-blue-700">{lang === 'fr' ? 'Taux de change' : 'سعر الصرف'}: </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={euroRate === '' ? '' : euroRate}
                        onChange={(e) => {
                          setRateTouched(true);
                          const value = e.target.value.trim();
                          if (value === '') {
                            setEuroRate('');
                          } else {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue) && numValue > 0) {
                              setEuroRate(numValue);
                            }
                          }
                        }}
                        className="w-32 p-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right font-bold"
                        placeholder="145"
                      />
                      <span className="text-blue-700 font-bold">DA/€</span>
                    </div>

                    {euroAmount && euroRate && (
                      <div className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-700">
                          {lang === 'fr' ? '= ' : '= '} 
                          <span className="font-bold">{Math.round(Number(euroAmount) * Number(euroRate)).toLocaleString()}</span> DA
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PRICING SUMMARY & VERIFICATION */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border-2 border-indigo-200">
        <h4 className="text-lg font-black text-indigo-900 mb-4">📋 {lang === 'fr' ? 'Vérification Finale' : 'التحقق النهائي'}</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Column - Pricing */}
          <div className="space-y-2 bg-white rounded-lg p-4 border border-indigo-200">
            <h5 className="font-bold text-indigo-900 text-center mb-3">💰 {lang === 'fr' ? 'Détails des Prix' : 'تفاصيل الأسعار'}</h5>
            
            <div className="flex justify-between text-sm">
              <span className="text-indigo-700">{lang === 'fr' ? 'Prix Base:' : 'السعر الأساسي:'}</span>
              <span className="font-bold text-indigo-900">{fmt(calculatedBasePrice)}</span>
            </div>

            {servicesTotal > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-indigo-700">{lang === 'fr' ? 'Services:' : 'الخدمات:'}</span>
                <span className="font-bold text-indigo-900">{fmt(servicesTotal)}</span>
              </div>
            )}
            
            {deliveryFeeAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-indigo-700">
                  {lang === 'fr' ? 'Livraison' : 'التوصيل'}
                  {clientDeliveryFee === 0 && (
                    <span className="ms-1 text-xs font-medium text-green-700">
                      ({lang === 'fr' ? 'à la charge du propriétaire' : 'على عاتق المالك'})
                    </span>
                  )}
                  :
                </span>
                <span className={`font-bold ${clientDeliveryFee === 0 ? 'text-green-700 line-through' : 'text-indigo-900'}`}>
                  {fmt(deliveryFeeAmount)}
                </span>
              </div>
            )}

            {tvaEnabled && tvaAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-indigo-700">{lang === 'fr' ? 'TVA (' + tvaRate + '%):' : 'TVA (' + tvaRate + '%):'}</span>
                <span className="font-bold text-indigo-900">{fmt(tvaAmount)}</span>
              </div>
            )}

            <div className="border-t border-indigo-200 pt-2 flex justify-between text-base font-bold">
              <span className="text-indigo-900">{lang === 'fr' ? 'TOTAL:' : 'المجموع:'}</span>
              <span className="text-lg text-indigo-600">{fmt(totalPrice)}</span>
            </div>

            {paymentCurrency === 'EUR' && (
              <div className="flex justify-between text-xs">
                <span className="text-indigo-500">{lang === 'fr' ? 'Équivalent DZD:' : 'المعادل بالدينار:'}</span>
                <span className="font-bold text-indigo-500">{formatMoney(totalPriceDzd, 'DZD')}</span>
              </div>
            )}

            <div className="flex justify-between text-sm pt-2">
              <span className="text-indigo-700">{lang === 'fr' ? 'Caution:' : 'الضمان:'}</span>
              <span className="text-right">
                <span className="font-bold text-indigo-900">{formatMoney(deposit, 'DZD')}</span>
                {/* Saisie en euros ⇒ c'est ce montant qui fait foi, pas sa conversion. */}
                <span className="block text-xs font-bold text-amber-700">
                  {cautionCurrency === 'EUR' && euroAmount !== ''
                    ? formatMoney(Number(euroAmount), 'EUR')
                    : `≈ ${formatMoney(fromDzd(deposit, 'EUR', rate), 'EUR')}`}
                </span>
              </span>
            </div>
          </div>

          {/* Right Column - Duration & Payment */}
          <div className="space-y-2 bg-white rounded-lg p-4 border border-indigo-200">
            <h5 className="font-bold text-indigo-900 text-center mb-3">⏱️ {lang === 'fr' ? 'Durée et Paiement' : 'المدة والدفع'}</h5>
            
            <div className="flex justify-between text-sm">
              <span className="text-indigo-700">{lang === 'fr' ? 'Nombre de jours:' : 'عدد الأيام:'}</span>
              <span className="font-bold text-indigo-900">{days}</span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-indigo-700">{lang === 'fr' ? 'Semaines:' : 'الأسابيع:'}</span>
              <span className="font-bold text-indigo-900">{weeks}</span>
            </div>
            
            <div className="flex justify-between text-sm">
              <span className="text-indigo-700">{lang === 'fr' ? 'Jours restants:' : 'الأيام المتبقية:'}</span>
              <span className="font-bold text-indigo-900">{remainingDays}</span>
            </div>

            <div className="border-t border-indigo-200 pt-2">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-indigo-700">{lang === 'fr' ? 'Acompte:' : 'الدفعة الأولى:'}</span>
                <span className="font-bold text-indigo-900">{fmt(advancePayment)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-indigo-700">{lang === 'fr' ? 'Reste à payer:' : 'المتبقي:'}</span>
                <span className="font-bold text-indigo-900">{fmt(remainingPayment)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Data Storage Info */}
        <div className="mt-4 bg-indigo-100 rounded-lg p-3 border border-indigo-300">
          <p className="text-xs text-indigo-900 mb-2">
            <span className="font-bold">💾 {lang === 'fr' ? 'Cette étape sauvegarde:' : 'هذه الخطوة تحفظ:'}</span>
          </p>
          <ul className="text-xs text-indigo-800 space-y-1 ml-4">
            <li>✓ {lang === 'fr' ? 'Devise de règlement: ' : 'عملة الدفع: '}<span className="font-bold">{paymentCurrency === 'EUR' ? `EUR (${rate} DA/€)` : 'DZD'}</span></li>
            <li>✓ {lang === 'fr' ? 'Prix Total: ' : 'السعر الكلي: '}<span className="font-bold">{fmt(totalPrice)}</span>{paymentCurrency === 'EUR' && <span className="opacity-70"> · {formatMoney(totalPriceDzd, 'DZD')}</span>}</li>
            <li>✓ {lang === 'fr' ? 'Acompte: ' : 'الدفعة الأولى: '}<span className="font-bold">{fmt(advancePayment)}</span></li>
            <li>✓ {lang === 'fr' ? 'Reste à payer: ' : 'المتبقي: '}<span className="font-bold">{fmt(remainingPayment)}</span></li>
            <li>✓ {lang === 'fr' ? 'Caution: ' : 'الضمان: '}<span className="font-bold">{formatMoney(deposit, 'DZD')}</span></li>
            <li>✓ {lang === 'fr' ? 'Durée: ' : 'المدة: '}<span className="font-bold">{days} {lang === 'fr' ? 'jours' : 'أيام'}</span></li>
            <li>✓ {lang === 'fr' ? 'TVA Appliquée: ' : 'تطبيق TVA: '}<span className="font-bold">{tvaEnabled ? (lang === 'fr' ? 'Oui (' + tvaRate + '%)' : 'نعم (' + tvaRate + '%)') : (lang === 'fr' ? 'Non' : 'لا')}</span></li>
          </ul>
        </div>
      </div>

      {/* ── Modalités de paiement ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-b border-slate-200">
          <h4 className="text-lg font-black text-slate-900">
            💳 {lang === 'fr' ? 'Modalités de Paiement' : 'شروط الدفع'}
          </h4>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {lang === 'fr' ? 'Réglé en' : 'الدفع بـ'} {paymentCurrency === 'EUR' ? 'EUR (€)' : 'DZD (DA)'}
          </span>
        </div>

        <div className="p-6 space-y-6">
          {/* Barre de répartition acompte / reste */}
          <div>
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
              <span>{lang === 'fr' ? 'Payé à la réservation' : 'مدفوع عند الحجز'}</span>
              <span>{lang === 'fr' ? 'Reste à payer' : 'المبلغ المتبقي'}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-200 overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${totalPrice > 0 ? Math.min(100, (advancePayment / totalPrice) * 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-sm font-black mt-2">
              <span className="text-emerald-700">{fmt(advancePayment)}</span>
              <span className={remainingPayment > 0 ? 'text-amber-700' : 'text-slate-400'}>{fmt(remainingPayment)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Acompte : pré-rempli au total (le client règle tout), éditable */}
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
              <label className="block font-bold text-emerald-900 mb-1">
                💰 {lang === 'fr' ? 'Acompte à la Réservation' : 'الدفعة الأولى عند الحجز'}
              </label>
              <p className="text-xs text-emerald-700 mb-3">
                {advanceInput === ''
                  ? (lang === 'fr' ? 'Par défaut : le client règle la totalité.' : 'افتراضيًا: يدفع العميل المبلغ كاملًا.')
                  : (lang === 'fr' ? 'Montant personnalisé.' : 'مبلغ مخصص.')}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max={totalPrice}
                    step={paymentCurrency === 'EUR' ? '0.01' : '1'}
                    value={advanceInput === '' ? totalPrice : advanceInput}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (value === '') { setAdvanceInput(''); return; }
                      const n = parseFloat(value);
                      if (!isNaN(n) && n >= 0) {
                        setAdvanceInput(roundIn(Math.min(n, totalPrice), paymentCurrency));
                      }
                    }}
                    className="w-full ps-3 pe-10 py-3 rounded-lg border-2 border-emerald-300 bg-white text-right text-lg font-black text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 font-black text-emerald-700 pointer-events-none">
                    {currencySymbol(paymentCurrency)}
                  </span>
                </div>
                {advanceInput !== '' && (
                  <button
                    type="button"
                    onClick={() => setAdvanceInput('')}
                    title={lang === 'fr' ? 'Remettre au total' : 'إعادة إلى المجموع'}
                    className="px-3 py-3 rounded-lg bg-white border-2 border-emerald-300 text-emerald-800 font-black hover:bg-emerald-50 transition-colors"
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>

            {/* Reste : toujours calculé */}
            <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4">
              <label className="block font-bold text-slate-900 mb-1">
                📊 {lang === 'fr' ? 'Reste à Payer' : 'المبلغ المتبقي'}
              </label>
              <p className="text-xs text-slate-500 mb-3">
                {lang === 'fr' ? 'Calculé automatiquement : total − acompte.' : 'محسوب تلقائيًا: المجموع − الدفعة الأولى.'}
              </p>
              <div className="relative">
                <input
                  type="text"
                  value={fmt(remainingPayment)}
                  readOnly
                  tabIndex={-1}
                  className={`w-full px-3 py-3 rounded-lg border-2 border-slate-200 text-right text-lg font-black cursor-default ${
                    remainingPayment > 0 ? 'bg-amber-50 text-amber-900' : 'bg-white text-slate-400'
                  }`}
                />
              </div>
              {remainingPayment === 0 && (
                <p className="text-xs font-bold text-emerald-700 mt-2">
                  ✓ {lang === 'fr' ? 'Réservation intégralement réglée.' : 'تم دفع الحجز بالكامل.'}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-900 mb-2">
              📝 {lang === 'fr' ? 'Notes de Paiement' : 'ملاحظات الدفع'}
            </label>
            <textarea
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-400 focus:border-transparent"
              rows={3}
              placeholder={lang === 'fr' ? 'Conditions spéciales de paiement...' : 'شروط دفع خاصة...'}
            />
          </div>
        </div>
      </div>
    </div>
  );
};