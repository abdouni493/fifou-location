import { ReservationDetails } from '../types';

/**
 * Force a phone number to render strictly left-to-right, even inside an RTL (Arabic)
 * document, so it prints in the same order as the French layout.
 */
const ltrPhone = (value: any): string =>
  `<span dir="ltr" style="unicode-bidi:bidi-override;direction:ltr;display:inline-block">${value ?? ''}</span>`;

/**
 * Force any latin/number value (car immatriculation, VIN, model, mileage, ...) to render
 * strictly left-to-right so it keeps the same order as French even inside an RTL (Arabic)
 * document. Without this, plate numbers like "01234-116-16" print inverted ("16-116-01234").
 */
const ltr = ltrPhone;

/** Dates always printed dd/mm/yyyy (as on the reference layout), in both languages. */
const fmtDate = (value: any): string => {
  if (!value) return '';
  // Date-only strings ("1993-07-31") are parsed as UTC midnight by `new Date`,
  // which shifts to the previous day in negative-offset timezones — split manually.
  const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnly) return ltr(`${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`);
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return ltr(d.toLocaleDateString('fr-FR'));
};

export const generateContractHTML = (
  reservation: ReservationDetails | null,
  agencySettings: any,
  secondConductor: any,
  templateLang: 'fr' | 'ar'
): string => {
  const isFrench = templateLang === 'fr';
  const textDir = isFrench ? 'ltr' : 'rtl';

  const labels = {
    contractTitle: isFrench ? 'Contrat de Location de Véhicule' : 'عقد كراء السيارة',
    contractDate: isFrench ? 'Date du Contrat' : 'تاريخ العقد',
    contractNumber: isFrench ? 'N° du Contrat' : 'رقم العقد',
    createdBy: isFrench ? 'Créé par' : 'أنشئ بواسطة',
    rentalPeriod: isFrench ? 'Période de Location' : 'فترة الإيجار',
    departure: isFrench ? 'Départ' : 'المغادرة',
    return: isFrench ? 'Retour' : 'العودة',
    duration: isFrench ? 'Durée' : 'المدة',
    days: isFrench ? 'jours' : 'أيام',
    mainDriver: isFrench ? 'Conducteur Principal' : 'السائق الرئيسي',
    secondDriver: isFrench ? 'Deuxième Conducteur' : 'السائق الثاني',
    fullName: isFrench ? 'Nom Complet' : 'الاسم الكامل',
    birthDate: isFrench ? 'Date de Naissance' : 'تاريخ الميلاد',
    birthPlace: isFrench ? 'Lieu de Naissance' : 'مكان الميلاد',
    licenseNumber: isFrench ? 'N° du Permis' : 'رقم الرخصة',
    licenseExpiry: isFrench ? 'Expiration du Permis' : 'تاريخ انتهاء الرخصة',
    licenseDelivery: isFrench ? 'Délivrance du Permis' : 'تاريخ إصدار الرخصة',
    licensePlace: isFrench ? 'Lieu de Délivrance' : 'مكان إصدار الرخصة',
    vehicleInfo: isFrench ? 'Informations du Véhicule' : 'معلومات المركبة',
    registration: isFrench ? 'Immatriculation' : 'التسجيل',
    model: isFrench ? 'Modèle' : 'الموديل',
    fuelType: isFrench ? 'Type' : 'النوع',
    color: isFrench ? 'Couleur' : 'اللون',
    vin: isFrench ? 'N° de Série' : 'الرقم التسلسلي',
    mileage: isFrench ? 'Kilométrage' : 'الكيلومترات',
    kmPerDay: isFrench ? 'Kilométrage par Jour' : 'الكيلومترات في اليوم',
    specialConditions: isFrench ? 'Conditions Particulières' : 'الشروط الخاصة',
    clientSignature: isFrench ? 'Signature du Client' : 'توقيع العميل',
    agencySignature: isFrench ? "Signature de l'Agence" : 'توقيع الوكالة',
    dateAndSignature: isFrench ? 'Date et signature' : 'التاريخ والتوقيع',
    inspectionNote: isFrench
      ? "Avant la réception du véhicule, le locataire a inspecté la voiture de l'intérieur et de l'extérieur. Tout objet en sa possession pendant la période de location contraire à la loi l'expose aux sanctions prévues par la réglementation."
      : 'قبل استلام السيارة قام المستأجر بفحص السيارة من الداخل والخارج، وأي شيء يكون بحوزته في مدة استئجارها يكون مخالفة للقانون والعقوبات',
  };

  const termsList = isFrench
    ? [
        "1- Toute extension doit être confirmée au minimum 48 heures avant l'expiration du contrat de location, incluant le kilométrage et le carburant à la retour.",
        '2- Ne pas conduire le véhicule avec un carburant de réserve (réserve).',
        "3- Le renouvellement du contrat de location commence à partir de la date d'expiration du contrat et est la responsabilité du client.",
        '4- Le non-respect du contrat de location expose le client à une pénalité du montant journalier complet.'
      ]
    : [
        '1- كل تمديد يجب على الزبون الابلاغ قبل 48 ساعة من تاريخ انتهاء صلاحيات عقد الكراء كيلومترات وقود العودة',
        '2- عدم قيادة السيارة بوقود احتياطي (réserve)',
        '3- تجديد عقد الكراء يكون من تاريخ انتهاء العقد من مسؤولية الزبون',
        '4- احترام موعد دخول السيارة في الوقت المحدد'
      ];

  const agencyName = (agencySettings?.name || 'AGENCE').toUpperCase();
  const contractNumber = reservation?.id ? reservation.id.toString().substring(0, 8).toUpperCase() : 'N/A';
  const carPhoto = reservation?.car?.images?.[0] || '';

  /** Broken/expired remote assets must never leave a torn frame on the printed page. */
  const hideOnError = `onerror="this.style.display='none'"`;

  /** One "label ..... value" line of the driver / vehicle columns. */
  const infoRow = (label: string, value: string): string => `
    <div class="info-row">
      <span class="info-label">${label}</span>
      <span class="info-value">${value || ''}</span>
    </div>`;

  const driverRows = (person: any, snake: boolean): string => {
    const g = (a: string, b: string) => (snake ? (person?.[a] ?? person?.[b]) : person?.[b]) ?? '';
    const fullName = `${g('first_name', 'firstName')} ${g('last_name', 'lastName')}`.trim();
    return [
      infoRow(labels.fullName, fullName),
      infoRow(labels.birthDate, fmtDate(g('date_of_birth', 'dateOfBirth'))),
      infoRow(labels.birthPlace, g('place_of_birth', 'placeOfBirth')),
      infoRow(labels.licenseNumber, ltr(g('license_number', 'licenseNumber'))),
      infoRow(labels.licenseExpiry, fmtDate(g('license_expiration_date', 'licenseExpirationDate'))),
      infoRow(labels.licenseDelivery, fmtDate(g('license_delivery_date', 'licenseDeliveryDate'))),
      infoRow(labels.licensePlace, g('license_delivery_place', 'licenseDeliveryPlace')),
    ].join('');
  };

  const vehicleRows = [
    infoRow(labels.registration, ltr(reservation?.car?.registration || '')),
    infoRow(labels.model, ltr(`${reservation?.car?.brand || ''} ${reservation?.car?.model || ''}`.trim())),
    infoRow(labels.fuelType, reservation?.car?.energy || ''),
    infoRow(labels.color, reservation?.car?.color || ''),
    infoRow(labels.vin, ltr(reservation?.car?.vin || '')),
    infoRow(labels.mileage, ltr(`${reservation?.departureInspection?.mileage || reservation?.car?.mileage || 0} km`)),
    infoRow(labels.kmPerDay, ltr('300 km')),
  ].join('');

  const html = `
    <!DOCTYPE html>
    <html dir="${textDir}" lang="${isFrench ? 'fr' : 'ar'}">
    <head>
      <meta charset="UTF-8">
      <title>${labels.contractTitle}</title>
      <style>
        /* The sheet owns its own margins (.page-container padding) so the layout can
           never be clipped or pushed onto a second sheet by the printer defaults. */
        @page { size: A4 portrait; margin: 0; }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 210mm;
          margin: 0;
          padding: 0;
          overflow: hidden; /* nothing may spill onto a 2nd sheet */
        }
        body {
          font-family: 'Arial', sans-serif;
          line-height: 1.35;
          color: #1f2937;
          background: white;
          direction: ${textDir};
          font-size: 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        :root {
          --blue: #7f1d1d;
          --red: #d32f2f;
          --ink: #111827;
          --border: #c3cfe2;
          --row-line: #e5eaf3;
          --head-bg: #f5f7fb;
          --muted: #6b7280;
        }
        .page-container {
          /* 296mm (not 297) keeps Chrome from rounding into a trailing blank page. */
          width: 210mm;
          height: 296mm;
          padding: 9mm 10mm 8mm;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* ===== HEADER : agency name ===== */
        .agency-title {
          text-align: center;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: 27px;
          font-weight: bold;
          letter-spacing: 1px;
          color: var(--blue);
        }

        /* ===== HEADER : logo (left) / contract title (center) / contacts (right) ===== */
        .brand-row {
          direction: ltr; /* fixed visual placement in both languages */
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 2px 12px;
          border-bottom: 1px solid var(--border);
        }
        .brand-logo {
          width: 175px;
          display: flex;
          justify-content: flex-start;
          align-items: center;
        }
        .brand-logo img {
          max-width: 155px;
          max-height: 80px;
          object-fit: contain;
        }
        .doc-title {
          flex: 1;
          text-align: center;
          font-size: 24px;
          font-weight: bold;
          color: var(--blue);
        }
        .agency-contact {
          width: 175px;
          text-align: right;
          font-size: 11.5px;
          line-height: 1.75;
        }
        .agency-contact .contact-address { color: var(--ink); font-weight: bold; }
        .agency-contact .contact-phone { color: #374151; font-weight: 600; }

        /* ===== META / PERIOD TABLES ===== */
        .meta-table {
          display: grid;
          grid-template-columns: 1fr 1fr 1.2fr;
          border: 1px solid var(--border);
          margin-top: 9px;
        }
        .meta-cell {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-inline-end: 1px solid var(--border);
        }
        .meta-cell:last-child { border-inline-end: none; }
        .meta-label { color: var(--blue); font-weight: bold; font-size: 11px; }
        .meta-value { font-weight: bold; font-size: 12px; color: var(--ink); }

        .period-block {
          border: 1px solid var(--border);
          border-top: none;
        }
        .period-title {
          text-align: center;
          font-size: 11px;
          font-weight: bold;
          color: #374151;
          background: var(--head-bg);
          padding: 5px;
          border-bottom: 1px solid var(--border);
        }
        .period-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
        }

        /* ===== VEHICLE (visual left) / DRIVER (visual right) COLUMNS ===== */
        .info-columns {
          direction: ltr; /* vehicle always visual-left, driver always visual-right */
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 8px;
        }
        .info-box {
          border: 1px solid var(--border);
          page-break-inside: avoid;
        }
        .info-box-title {
          text-align: center;
          color: var(--blue);
          font-weight: bold;
          font-size: 13px;
          background: var(--head-bg);
          padding: 5px;
          border-bottom: 1px solid var(--border);
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--row-line);
        }
        .info-row:last-child { border-bottom: none; }
        .info-label { color: var(--blue); font-weight: bold; font-size: 11px; }
        .info-value { font-weight: bold; font-size: 12px; color: var(--ink); text-align: end; }

        .second-driver-rows {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 16px;
          padding: 0 4px;
        }

        /* ===== INSPECTION NOTE ===== */
        .note-box {
          border: 1px solid var(--border);
          padding: 9px 10px;
          margin-top: 9px;
          font-size: 11px;
          font-weight: 600;
          text-align: center;
          color: var(--ink);
        }

        /* ===== CAR PHOTO (left) + SPECIAL CONDITIONS (right) ===== */
        .bottom-row {
          direction: ltr; /* photo always visual-left, conditions always visual-right */
          display: grid;
          grid-template-columns: 1fr 1.35fr;
          gap: 10px;
          margin-top: 9px;
          align-items: center;
        }
        .car-photo {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 48mm;
        }
        .car-photo img {
          max-width: 100%;
          max-height: 48mm;
          object-fit: contain;
        }
        .car-photo-placeholder {
          width: 100%;
          height: 100%;
          border: 1px solid var(--row-line);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 44px;
          color: #cbd5e1;
        }
        .conditions-box {
          border: 1px solid var(--border);
          padding: 10px 12px;
        }
        .conditions-title {
          color: var(--red);
          font-weight: bold;
          font-size: 13px;
          margin-bottom: 6px;
        }
        .condition-item {
          color: var(--red);
          font-size: 11px;
          font-weight: 600;
          line-height: 2.05;
        }

        /* ===== SIGNATURES : agency (left) / client (right) ===== */
        /* Directly under the car photo / conditions row — the blank margin above
           each rule is the signing space, the caption hangs underneath it. */
        .signatures {
          direction: ltr; /* fixed visual placement in both languages */
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
          margin-top: 15mm;
        }
        .signature-box {
          border-top: 1px solid var(--border);
          padding-top: 6px;
          text-align: center;
        }
        .signature-title { font-weight: bold; font-size: 13px; color: var(--ink); }
        .signature-subtitle { font-size: 10px; color: var(--muted); margin-top: 2px; }
      </style>
    </head>
    <body>
      <div class="page-container">

        <!-- AGENCY NAME -->
        <div class="agency-title">${agencyName}</div>

        <!-- LOGO / CONTRACT TITLE / AGENCY CONTACTS -->
        <div class="brand-row">
          <div class="brand-logo">
            ${agencySettings?.logo ? `<img src="${agencySettings.logo}" alt="Logo" ${hideOnError}>` : ''}
          </div>
          <div class="doc-title" dir="${textDir}">${labels.contractTitle}</div>
          <div class="agency-contact" dir="${textDir}">
            ${agencySettings?.address ? `<div class="contact-address">${agencySettings.address}</div>` : ''}
            ${agencySettings?.phone ? `<div class="contact-phone">${ltrPhone(agencySettings.phone)}</div>` : ''}
            ${agencySettings?.phone_number_2 ? `<div class="contact-phone">${ltrPhone(agencySettings.phone_number_2)}</div>` : ''}
          </div>
        </div>

        <!-- CONTRACT META -->
        <div class="meta-table">
          <div class="meta-cell">
            <span class="meta-label">${labels.contractDate}</span>
            <span class="meta-value">${fmtDate(new Date())}</span>
          </div>
          <div class="meta-cell">
            <span class="meta-label">${labels.contractNumber}</span>
            <span class="meta-value">${ltr(contractNumber)}</span>
          </div>
          <div class="meta-cell">
            <span class="meta-label">${labels.createdBy}</span>
            <span class="meta-value">${agencyName}</span>
          </div>
        </div>

        <!-- RENTAL PERIOD -->
        <div class="period-block">
          <div class="period-title">${labels.rentalPeriod}</div>
          <div class="period-row">
            <div class="meta-cell">
              <span class="meta-label">${labels.departure}</span>
              <span class="meta-value">${fmtDate(reservation?.step1?.departureDate)}</span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">${labels.return}</span>
              <span class="meta-value">${fmtDate(reservation?.step1?.returnDate)}</span>
            </div>
            <div class="meta-cell">
              <span class="meta-label">${labels.duration}</span>
              <span class="meta-value">${reservation?.totalDays || 0} ${labels.days}</span>
            </div>
          </div>
        </div>

        <!-- VEHICLE (visual left) / MAIN DRIVER (visual right) -->
        <div class="info-columns">
          <div class="info-box" dir="${textDir}">
            <div class="info-box-title">${labels.vehicleInfo}</div>
            ${vehicleRows}
          </div>
          <div class="info-box" dir="${textDir}">
            <div class="info-box-title">${labels.mainDriver}</div>
            ${driverRows(reservation?.client, false)}
          </div>
        </div>

        ${secondConductor ? `
        <!-- SECOND DRIVER -->
        <div class="info-box" style="margin-top: 8px;">
          <div class="info-box-title">${labels.secondDriver}</div>
          <div class="second-driver-rows">
            ${driverRows(secondConductor, true)}
          </div>
        </div>
        ` : ''}

        <!-- INSPECTION NOTE -->
        <div class="note-box">${labels.inspectionNote}</div>

        <!-- CAR PHOTO (visual left) + SPECIAL CONDITIONS (visual right) -->
        <div class="bottom-row">
          <div class="car-photo">
            ${carPhoto ? `<img src="${carPhoto}" alt="Véhicule" ${hideOnError}>` : '<div class="car-photo-placeholder">🚗</div>'}
          </div>
          <div class="conditions-box" dir="${textDir}">
            <div class="conditions-title">${labels.specialConditions}</div>
            ${termsList.map(term => `<div class="condition-item">${term}</div>`).join('')}
          </div>
        </div>

        <!-- SIGNATURES : agency (visual left) / client (visual right) -->
        <div class="signatures">
          <div class="signature-box" dir="${textDir}">
            <div class="signature-title">${labels.agencySignature}</div>
            <div class="signature-subtitle">${labels.dateAndSignature}</div>
          </div>
          <div class="signature-box" dir="${textDir}">
            <div class="signature-title">${labels.clientSignature}</div>
            <div class="signature-subtitle">${labels.dateAndSignature}</div>
          </div>
        </div>

      </div>
    </body>
    </html>
  `;

  return html;
};
