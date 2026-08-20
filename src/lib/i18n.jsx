import { createContext, useContext, useEffect, useState } from 'react';

// src/lib/i18n.jsx — English/Indonesian language toggle for the whole app.
//
// Deliberately a small hand-rolled dictionary + context instead of pulling
// in react-i18next/similar — this codebase avoids SDK/library abstraction
// layers everywhere else (raw fetch instead of the Google SDKs, no ORM,
// etc.), and the translation need here is "swap strings, remember the
// choice," which doesn't need a framework.
//
// Usage: `const { t } = useT();` then `t('nav.directory')`. Keys are
// dot-namespaced by page/section (see TRANSLATIONS below) so it's obvious
// at a glance which file a given string belongs to. `t(key, vars)` does
// simple `{placeholder}` interpolation for the handful of strings that
// need it (e.g. delete confirmations with a name in them).
//
// Persistence: localStorage (`ccg_hr_language`) — this is a real deployed
// app in the person's own browser, not an in-chat preview, so localStorage
// is the right tool here (unlike Claude-side conversation artifacts, which
// can't rely on it). Falls back to 'en' if nothing's stored yet or the
// stored value isn't 'en'/'id'.
//
// What this covers: all UI text (labels, buttons, headings, placeholders,
// hints, confirmations, nav) plus the static system-authored messages this
// app itself writes (success/status banners like "Submitted — pending HR
// approval," the account-setup email). It does NOT attempt to translate
// arbitrary dynamic error text that passes through from the database or a
// third-party API (e.g. a raw Postgres constraint violation, or a Google
// Drive API error message) — those remain in English, since there's no
// reliable way to pre-translate free-form runtime text. `t.err(message)`
// below covers the common, enumerable, *static* error strings this app's
// own backend returns verbatim (e.g. "Insufficient permissions," "Not
// found") as a best-effort translation with a safe fallback to the raw
// message for anything not in the table.

const STORAGE_KEY = 'ccg_hr_language';
const LanguageContext = createContext({ language: 'en', setLanguage: () => {} });

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === 'id' ? 'id' : 'en';
    } catch {
      return 'en';
    }
  });

  function setLanguage(lang) {
    setLanguageState(lang);
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Non-fatal — the toggle still works for the rest of this session,
      // it just won't be remembered on reload (e.g. private browsing).
    }
  }

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <LanguageContext.Provider value={{ language, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

// Shared EN/ID toggle — used on the pre-auth screens (Login, SetPassword)
// and the dashboard header. Two plain buttons rather than a <select> so
// the current choice is always visible at a glance without opening
// anything, and so it reads fine at the small sizes those headers use.
export function LanguageToggle({ style }) {
  const { language, setLanguage } = useLanguage();
  const baseButton = {
    padding: '3px 8px',
    fontSize: 12,
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
  };
  return (
    <div style={{ display: 'inline-flex', ...style }}>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        style={{
          ...baseButton,
          borderRadius: '4px 0 0 4px',
          fontWeight: language === 'en' ? 700 : 400,
          background: language === 'en' ? '#111' : '#fff',
          color: language === 'en' ? '#fff' : '#333',
        }}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('id')}
        style={{
          ...baseButton,
          borderRadius: '0 4px 4px 0',
          borderLeft: 'none',
          fontWeight: language === 'id' ? 700 : 400,
          background: language === 'id' ? '#111' : '#fff',
          color: language === 'id' ? '#fff' : '#333',
        }}
      >
        ID
      </button>
    </div>
  );
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function useT() {
  const { language } = useLanguage();
  function t(key, vars) {
    const value = TRANSLATIONS[language]?.[key] ?? TRANSLATIONS.en[key] ?? key;
    return interpolate(value, vars);
  }
  t.err = function translateError(message) {
    if (!message) return message;
    const table = ERROR_TRANSLATIONS[language];
    if (!table) return message;
    for (const [needle, translated] of Object.entries(table)) {
      if (message.includes(needle)) return message.replace(needle, translated);
    }
    return message;
  };
  t.lang = language;
  return t;
}

// ─── Common, enumerable, static server error strings ───────────────────
// Only exact/substring matches for messages this app's own lib/*.mjs files
// return verbatim (grep-checked against the codebase) — not an attempt to
// cover every possible error, see the file header note above.
const ERROR_TRANSLATIONS = {
  id: {
    'Insufficient permissions': 'Izin tidak mencukupi',
    'Not authenticated': 'Belum masuk (login)',
    'Not found': 'Tidak ditemukan',
    'Invalid email or password': 'Email atau kata sandi salah',
    'Invalid password': 'Kata sandi salah',
    'Login failed': 'Gagal masuk',
    'Network error': 'Kesalahan jaringan',
    'Password is required': 'Kata sandi wajib diisi',
    'Password must be at least 8 characters': 'Kata sandi minimal 8 karakter',
    'Passwords do not match': 'Kata sandi tidak cocok',
    'Invalid or already-used link': 'Tautan tidak valid atau sudah digunakan',
    'This link has expired': 'Tautan ini sudah kedaluwarsa',
    'Method not allowed': 'Metode tidak diizinkan',
    'Internal server error': 'Kesalahan server internal',
    "You can't approve or reject your own request": 'Anda tidak dapat menyetujui atau menolak permintaan Anda sendiri',
    'Already Approved': 'Sudah disetujui',
    'Already Rejected': 'Sudah ditolak',
    'employee_id is required': 'employee_id wajib diisi',
  },
};

const TRANSLATIONS = {
  en: {
    // ── common ──
    'common.loading': 'Loading…',
    'common.save': 'Save',
    'common.saving': 'Saving…',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.deleting': 'Deleting…',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.adding': 'Adding…',
    'common.submit': 'Submit',
    'common.submitting': 'Submitting…',
    'common.yes': 'Yes',
    'common.none': 'None',
    'common.notes': 'Notes',
    'common.notesOptional': 'Notes (optional)',
    'common.optional': 'optional',
    'common.language': 'Language',

    // ── login ──
    'login.emailPlaceholder': 'Email (leave blank for admin login)',
    'login.passwordPlaceholder': 'Password',
    'login.signIn': 'Sign in',
    'login.signingIn': 'Signing in…',
    'login.failed': 'Login failed',
    'login.networkError': 'Network error',

    // ── setPassword ──
    'setPassword.title': 'Set your password',
    'setPassword.newPasswordPlaceholder': 'New password (min. 8 characters)',
    'setPassword.confirmPlaceholder': 'Confirm password',
    'setPassword.setPassword': 'Set password',
    'setPassword.saving': 'Saving…',
    'setPassword.done': 'Password set. You can log in now.',
    'setPassword.goToLogin': 'Go to login',
    'setPassword.tooShort': 'Password must be at least 8 characters',
    'setPassword.mismatch': 'Passwords do not match',

    // ── app / nav ──
    'app.navDirectory': 'Directory',
    'app.navOrgChart': 'Org chart',
    'app.navLeave': 'Leave',
    'app.navDocuments': 'Documents',
    'app.navChangeRequests': 'Change requests',
    'app.logOut': 'Log out',

    // ── directory ──
    'directory.searchPlaceholder': 'Search name, ID, department, team, title…',
    'directory.addEmployee': '+ Add employee',
    'directory.name': 'Name',
    'directory.nickname': 'Nickname',
    'directory.employeeId': 'Employee ID',
    'directory.jobTitle': 'Job title',
    'directory.department': 'Department',
    'directory.team': 'Team',
    'directory.status': 'Status',
    'directory.startDate': 'Start date',
    'directory.viewCard': 'View card',
    'directory.noEmployees': 'No employees yet.',

    // ── employeeForm: sections ──
    'employeeForm.section.identity': 'Identity',
    'employeeForm.section.personal': 'Personal',
    'employeeForm.section.employmentStatus': 'Employment status',
    'employeeForm.section.organisation': 'Organisation',
    'employeeForm.section.employmentDetails': 'Employment details',
    'employeeForm.section.compensation': 'Compensation',
    'employeeForm.section.compliance': 'Compliance',

    // ── employeeForm: field labels ──
    'employeeForm.field.employee_id': 'Employee ID',
    'employeeForm.field.full_name': 'Full name',
    'employeeForm.field.nickname': 'Nickname (for disambiguation)',
    'employeeForm.field.photo_url': 'Photo URL',
    'employeeForm.field.email': 'Email',
    'employeeForm.field.phone': 'Phone',
    'employeeForm.field.date_of_birth': 'Date of birth',
    'employeeForm.field.address': 'Address',
    'employeeForm.field.nationality': 'Nationality',
    'employeeForm.field.religion': 'Religion (for THR timing)',
    'employeeForm.field.emergency_contact_name': 'Emergency contact name',
    'employeeForm.field.emergency_contact_phone': 'Emergency contact phone',
    'employeeForm.field.emergency_contact_relationship': 'Emergency contact relationship',
    'employeeForm.field.employment_status': 'Employment status',
    'employeeForm.field.start_date': 'Start date',
    'employeeForm.field.end_date': 'End date',
    'employeeForm.field.company': 'Company',
    'employeeForm.field.department': 'Department',
    'employeeForm.field.job_title': 'Job title',
    'employeeForm.field.team': 'Team',
    'employeeForm.field.manager_id': 'Manager (employee ID) — blank if none (e.g. Executive)',
    'employeeForm.field.office_location': 'Office location',
    'employeeForm.field.permission_role': 'Permission role (access control, not job title)',
    'employeeForm.field.employment_type': 'Employment type',
    'employeeForm.field.contract_type': 'Contract type',
    'employeeForm.field.contract_start': 'Contract start',
    'employeeForm.field.contract_end': 'Contract end',
    'employeeForm.field.probation_end_date': 'Probation end date',
    'employeeForm.field.current_salary': 'Current salary',
    'employeeForm.field.salary_currency': 'Currency',
    'employeeForm.field.bonus_eligible': 'Bonus eligible',
    'employeeForm.field.kitas_expiry': 'KITAS expiry',
    'employeeForm.field.passport_expiry': 'Passport expiry',
    'employeeForm.field.work_permit_expiry': 'Work permit expiry',

    // ── employeeForm: chrome ──
    'employeeForm.backToDirectory': '← Back to directory',
    'employeeForm.editEmployee': 'Edit employee',
    'employeeForm.addEmployee': 'Add employee',
    'employeeForm.deleteEmployee': 'Delete employee',
    'employeeForm.deleting': 'Deleting…',
    'employeeForm.saveChanges': 'Save changes',
    'employeeForm.createEmployee': 'Create employee',
    'employeeForm.requestChange': 'Request change',
    'employeeForm.selfServiceNote':
      'Contact/personal fields only — anything else here needs HR/Admin to change. Saving a change sends it to HR for approval rather than applying immediately.',
    'employeeForm.pendingBanner': 'You have {count} change request(s) awaiting HR approval.',
    'employeeForm.submittedMsg': 'Submitted — your change is pending HR approval.',
    'employeeForm.deleteConfirm':
      'Permanently delete {name}? This also deletes their salary history, promotion history, and skills — there\'s no undo. If they\'ve actually left, use "Employment status" → Terminated/Resigned instead to keep their record.',
    'employeeForm.loginAccount': 'Login account',
    'employeeForm.emailPlaceholder': 'Email',
    'employeeForm.createLogin': 'Create login',
    'employeeForm.resendLogin': 'Reset password / resend',
    'employeeForm.sendingLogin': 'Sending…',
    'employeeForm.emailSent': 'Setup email sent to {email}.',
    'employeeForm.emailFailed': "Couldn't send the email automatically{detail} — copy the link below and send it yourself.",
    'employeeForm.linkFallbackNote': "One-time link (expires in 7 days) — also works as a manual fallback if the email above didn't arrive:",
    'employeeForm.accountActive': 'active',
    'employeeForm.accountLastLogin': ', last login {date}',
    'employeeForm.accountNeverLoggedIn': ' (never logged in)',
    'employeeForm.accountSetupPending': 'setup link sent, not used yet',
    'employeeForm.accountNoPassword': 'no password set',
    'employeeForm.salaryHistory': 'Salary history',
    'employeeForm.promotionHistory': 'Promotion history',
    'employeeForm.effectiveDate': 'Effective date',
    'employeeForm.amount': 'Amount',
    'employeeForm.currency': 'Currency',
    'employeeForm.reason': 'Reason',
    'employeeForm.date': 'Date',
    'employeeForm.previousTitle': 'Previous title',
    'employeeForm.newTitle': 'New title',
    'employeeForm.noEntriesYet': 'No entries yet.',

    // ── employeeCard ──
    'employeeCard.backToDirectory': '← Back to directory',
    'employeeCard.editFullProfile': 'Edit full profile',
    'employeeCard.pendingBanner': 'You have {count} change request(s) awaiting HR approval.',
    'employeeCard.discipline': 'Discipline',
    'employeeCard.disciplineNote': 'Changes here need HR approval once saved.',
    'employeeCard.levelNa': 'Level (n/a)',
    'employeeCard.submitted': 'Submitted — pending HR approval.',
    'employeeCard.addEntry': 'Add entry',
    'employeeCard.newEntryNote': 'New entries need HR approval once submitted.',
    'employeeCard.itemPlaceholder': 'Item (e.g. Blender, Bahasa Indonesia, AWS Certified...)',
    'employeeCard.none': 'None recorded',
    'employeeCard.removeConfirm': 'Remove "{item}"?',
    'employeeCard.removalSubmitted': 'Removal submitted — pending HR approval.',
    'employeeCard.category.Software Skill': 'Software Skill',
    'employeeCard.category.Technical Skill': 'Technical Skill',
    'employeeCard.category.Soft Skill': 'Soft Skill',
    'employeeCard.category.Language': 'Language',
    'employeeCard.category.Certification': 'Certification',
    'employeeCard.category.Training Completed': 'Training Completed',
    'employeeCard.category.Training Required': 'Training Required',
    'employeeCard.category.Career Path': 'Career Path',

    // ── orgChart ──
    'orgChart.title': 'Organisation structure',
    'orgChart.noUnits': 'No org units defined yet — add one below.',
    'orgChart.reportingLines': 'Reporting lines',
    'orgChart.employee': 'Employee',
    'orgChart.title_': 'Title',
    'orgChart.reportsTo': 'Reports to',
    'orgChart.noReportingLines': 'No reporting lines yet — set manager_id on employee records.',
    'orgChart.lead': 'Lead',
    'orgChart.changeLead': 'Change lead',
    'orgChart.assignLead': 'Assign lead',
    'orgChart.move': 'Move',
    'orgChart.reorder': 'Reorder',
    'orgChart.delete': 'Delete',
    'orgChart.noneOption': '— none —',
    'orgChart.topLevelOption': '— top level —',
    'orgChart.moving': 'Moving…',
    'orgChart.moveHere': 'Move here',
    'orgChart.orderPlaceholder': 'Order (lower = earlier)',
    'orgChart.deleteConfirm': 'Delete "{name}"? This only works if it has no sub-units under it.',
    'orgChart.addUnit': 'Add company / department / team',
    'orgChart.unitNamePlaceholder': 'Name (e.g. RT3D, Creative, Concepts Conveyed Group)',
    'orgChart.noLeadYetOption': '— no lead yet —',

    // ── leave ──
    'leave.title': 'Leave',
    'leave.noRecordHint': "This login isn't linked to an employee record, so there's no personal leave to show — approvals and balance management below still work.",
    'leave.myLeave': 'My leave',
    'leave.type': 'Type',
    'leave.cycle': 'Cycle',
    'leave.allocated': 'Allocated',
    'leave.used': 'Used',
    'leave.remaining': 'Remaining',
    'leave.myRequests': 'My requests',
    'leave.start': 'Start',
    'leave.end': 'End',
    'leave.halfDay': 'Half day',
    'leave.status': 'Status',
    'leave.reason': 'Reason',
    'leave.noRequestsYet': 'No requests yet.',
    'leave.reasonPlaceholder': 'Reason',
    'leave.requestLeave': 'Request leave',
    'leave.submitting': 'Submitting…',
    'leave.approvals': 'Approvals',
    'leave.approve': 'Approve',
    'leave.reject': 'Reject',
    'leave.noPendingApprovals': 'No pending approvals.',
    'leave.manageAllocations': 'Manage leave allocations',
    'leave.manageHint':
      "Sets how many days someone has for the current cycle (Annual runs on their own start-date anniversary; Sick and Emergency run on the calendar year). Requests are blocked outright once someone's used their allocation — nothing to allocate yet means nobody can request that type until it's set here.",
    'leave.selectEmployee': '— select employee —',
    'leave.allocatedDaysPlaceholder': 'Allocated days',

    // ── documents ──
    'documents.title': 'Documents',
    'documents.noRecordHint': "This login isn't linked to an employee record, so there's no personal document list to show here — company documents below still work.",
    'documents.myDocuments': 'My documents',
    'documents.employeeDocuments': 'Employee documents',
    'documents.pickAnyoneHint': 'Pick anyone to view or add to their personal documents.',
    'documents.selectEmployeeOption': '— select employee —',
    'documents.type': 'Type',
    'documents.link': 'Link',
    'documents.expiry': 'Expiry',
    'documents.open': 'Open',
    'documents.noDocuments': 'No documents yet.',
    'documents.deleteConfirm': 'Delete this document record? This only removes it from the dashboard — the file itself, if it lives in Drive, is untouched.',
    'documents.orLinkHint': 'or',
    'documents.pasteLinkPlaceholder': 'Paste a Google Drive link instead',
    'documents.addDocument': 'Add document',
    'documents.companyDocuments': 'Company documents',
    'documents.nothingHereYet': 'Nothing here yet',
    'documents.addFirstOneHint': ' — add the first one below.',
    'documents.title_': 'Title',
    'documents.minimumAccess': 'Minimum access',
    'documents.deleteCompanyConfirm': 'Delete this company document?',
    'documents.titlePlaceholder': 'Title',
    'documents.accessTierHint':
      'Documents are grouped by access tier — picking "Team Lead" both controls who can see it (Team Lead and everyone above: Main Lead, HR, Finance, Director, Administrator — plain Employees won\'t) and which folder it lands in. Uploading a file puts it in that tier\'s auto-created Drive folder (Company/{role}); pasting a link instead leaves it wherever it already lives.',

    // ── setup ──
    'setup.welcome': 'Welcome, {name}',
    'setup.intro':
      'Before you can use the rest of the app, take a minute to fill in your details and skills below. Once you click "Finish setup", any further changes to your card will need HR sign-off — this first pass doesn\'t.',
    'setup.yourDetails': 'Your details',
    'setup.confirmNote': "We've already filled in what we have on file — please check it's correct and fill in anything that's missing or out of date.",
    'setup.saveDetails': 'Save details',
    'setup.saved': 'Saved.',
    'setup.finish': 'Finish setup and enter the app',
    'setup.finishing': 'Finishing…',

    // ── changeRequests ──
    'changeRequests.title': 'Change requests',
    'changeRequests.intro': "Self-service edits to profile details and skills, submitted after each employee's own first-login setup — nothing here takes effect until approved.",
    'changeRequests.nothingPending': 'Nothing pending.',
    'changeRequests.notePlaceholder': 'Note (optional)',
    'changeRequests.approve': 'Approve',
    'changeRequests.reject': 'Reject',
    'changeRequests.working': 'Working…',
    'changeRequests.requestedAt': 'Requested {date}',
    'changeRequests.type.profile': 'Profile update',
    'changeRequests.type.skill_add': 'New skill/entry',
    'changeRequests.type.skill_update': 'Skill/entry update',
    'changeRequests.type.skill_delete': 'Skill/entry removal',
    'changeRequests.blank': '(blank)',
    'changeRequests.remove': 'Remove {category}: {item}',
    'changeRequests.levelSuffix': ' — level {level}',
  },

  id: {
    // ── common ──
    'common.loading': 'Memuat…',
    'common.save': 'Simpan',
    'common.saving': 'Menyimpan…',
    'common.cancel': 'Batal',
    'common.delete': 'Hapus',
    'common.deleting': 'Menghapus…',
    'common.edit': 'Ubah',
    'common.add': 'Tambah',
    'common.adding': 'Menambahkan…',
    'common.submit': 'Kirim',
    'common.submitting': 'Mengirim…',
    'common.yes': 'Ya',
    'common.none': 'Tidak ada',
    'common.notes': 'Catatan',
    'common.notesOptional': 'Catatan (opsional)',
    'common.optional': 'opsional',
    'common.language': 'Bahasa',

    // ── login ──
    'login.emailPlaceholder': 'Email (kosongkan untuk login admin)',
    'login.passwordPlaceholder': 'Kata sandi',
    'login.signIn': 'Masuk',
    'login.signingIn': 'Sedang masuk…',
    'login.failed': 'Gagal masuk',
    'login.networkError': 'Kesalahan jaringan',

    // ── setPassword ──
    'setPassword.title': 'Atur kata sandi Anda',
    'setPassword.newPasswordPlaceholder': 'Kata sandi baru (minimal 8 karakter)',
    'setPassword.confirmPlaceholder': 'Konfirmasi kata sandi',
    'setPassword.setPassword': 'Atur kata sandi',
    'setPassword.saving': 'Menyimpan…',
    'setPassword.done': 'Kata sandi berhasil diatur. Anda bisa masuk sekarang.',
    'setPassword.goToLogin': 'Ke halaman masuk',
    'setPassword.tooShort': 'Kata sandi minimal 8 karakter',
    'setPassword.mismatch': 'Kata sandi tidak cocok',

    // ── app / nav ──
    'app.navDirectory': 'Direktori',
    'app.navOrgChart': 'Struktur organisasi',
    'app.navLeave': 'Cuti',
    'app.navDocuments': 'Dokumen',
    'app.navChangeRequests': 'Permintaan perubahan',
    'app.logOut': 'Keluar',

    // ── directory ──
    'directory.searchPlaceholder': 'Cari nama, ID, departemen, tim, jabatan…',
    'directory.addEmployee': '+ Tambah karyawan',
    'directory.name': 'Nama',
    'directory.nickname': 'Nama panggilan',
    'directory.employeeId': 'ID Karyawan',
    'directory.jobTitle': 'Jabatan',
    'directory.department': 'Departemen',
    'directory.team': 'Tim',
    'directory.status': 'Status',
    'directory.startDate': 'Tanggal mulai',
    'directory.viewCard': 'Lihat kartu',
    'directory.noEmployees': 'Belum ada karyawan.',

    // ── employeeForm: sections ──
    'employeeForm.section.identity': 'Identitas',
    'employeeForm.section.personal': 'Data pribadi',
    'employeeForm.section.employmentStatus': 'Status kepegawaian',
    'employeeForm.section.organisation': 'Organisasi',
    'employeeForm.section.employmentDetails': 'Detail kepegawaian',
    'employeeForm.section.compensation': 'Kompensasi',
    'employeeForm.section.compliance': 'Kepatuhan',

    // ── employeeForm: field labels ──
    'employeeForm.field.employee_id': 'ID Karyawan',
    'employeeForm.field.full_name': 'Nama lengkap',
    'employeeForm.field.nickname': 'Nama panggilan (untuk pembeda)',
    'employeeForm.field.photo_url': 'URL foto',
    'employeeForm.field.email': 'Email',
    'employeeForm.field.phone': 'Telepon',
    'employeeForm.field.date_of_birth': 'Tanggal lahir',
    'employeeForm.field.address': 'Alamat',
    'employeeForm.field.nationality': 'Kewarganegaraan',
    'employeeForm.field.religion': 'Agama (untuk waktu THR)',
    'employeeForm.field.emergency_contact_name': 'Nama kontak darurat',
    'employeeForm.field.emergency_contact_phone': 'Telepon kontak darurat',
    'employeeForm.field.emergency_contact_relationship': 'Hubungan kontak darurat',
    'employeeForm.field.employment_status': 'Status kepegawaian',
    'employeeForm.field.start_date': 'Tanggal mulai',
    'employeeForm.field.end_date': 'Tanggal berakhir',
    'employeeForm.field.company': 'Perusahaan',
    'employeeForm.field.department': 'Departemen',
    'employeeForm.field.job_title': 'Jabatan',
    'employeeForm.field.team': 'Tim',
    'employeeForm.field.manager_id': 'Atasan (ID karyawan) — kosongkan jika tidak ada (misalnya Eksekutif)',
    'employeeForm.field.office_location': 'Lokasi kantor',
    'employeeForm.field.permission_role': 'Peran akses (kontrol akses, bukan jabatan)',
    'employeeForm.field.employment_type': 'Jenis kepegawaian',
    'employeeForm.field.contract_type': 'Jenis kontrak',
    'employeeForm.field.contract_start': 'Mulai kontrak',
    'employeeForm.field.contract_end': 'Akhir kontrak',
    'employeeForm.field.probation_end_date': 'Akhir masa percobaan',
    'employeeForm.field.current_salary': 'Gaji saat ini',
    'employeeForm.field.salary_currency': 'Mata uang',
    'employeeForm.field.bonus_eligible': 'Berhak bonus',
    'employeeForm.field.kitas_expiry': 'Kedaluwarsa KITAS',
    'employeeForm.field.passport_expiry': 'Kedaluwarsa paspor',
    'employeeForm.field.work_permit_expiry': 'Kedaluwarsa izin kerja',

    // ── employeeForm: chrome ──
    'employeeForm.backToDirectory': '← Kembali ke direktori',
    'employeeForm.editEmployee': 'Ubah karyawan',
    'employeeForm.addEmployee': 'Tambah karyawan',
    'employeeForm.deleteEmployee': 'Hapus karyawan',
    'employeeForm.deleting': 'Menghapus…',
    'employeeForm.saveChanges': 'Simpan perubahan',
    'employeeForm.createEmployee': 'Buat karyawan',
    'employeeForm.requestChange': 'Ajukan perubahan',
    'employeeForm.selfServiceNote':
      'Hanya kolom kontak/pribadi — hal lain di sini perlu diubah oleh HR/Admin. Menyimpan perubahan akan mengirimkannya ke HR untuk disetujui, bukan langsung berlaku.',
    'employeeForm.pendingBanner': 'Anda memiliki {count} permintaan perubahan yang menunggu persetujuan HR.',
    'employeeForm.submittedMsg': 'Terkirim — perubahan Anda menunggu persetujuan HR.',
    'employeeForm.deleteConfirm':
      'Hapus permanen {name}? Ini juga akan menghapus riwayat gaji, riwayat promosi, dan keahlian mereka — tidak bisa dibatalkan. Jika mereka sudah benar-benar keluar, gunakan "Status kepegawaian" → Diberhentikan/Mengundurkan diri agar catatannya tetap tersimpan.',
    'employeeForm.loginAccount': 'Akun login',
    'employeeForm.emailPlaceholder': 'Email',
    'employeeForm.createLogin': 'Buat login',
    'employeeForm.resendLogin': 'Atur ulang kata sandi / kirim ulang',
    'employeeForm.sendingLogin': 'Mengirim…',
    'employeeForm.emailSent': 'Email pengaturan terkirim ke {email}.',
    'employeeForm.emailFailed': 'Gagal mengirim email secara otomatis{detail} — salin tautan di bawah dan kirim sendiri.',
    'employeeForm.linkFallbackNote': 'Tautan sekali pakai (kedaluwarsa dalam 7 hari) — juga berfungsi sebagai cadangan manual jika email di atas tidak sampai:',
    'employeeForm.accountActive': 'aktif',
    'employeeForm.accountLastLogin': ', login terakhir {date}',
    'employeeForm.accountNeverLoggedIn': ' (belum pernah login)',
    'employeeForm.accountSetupPending': 'tautan pengaturan terkirim, belum digunakan',
    'employeeForm.accountNoPassword': 'kata sandi belum diatur',
    'employeeForm.salaryHistory': 'Riwayat gaji',
    'employeeForm.promotionHistory': 'Riwayat promosi',
    'employeeForm.effectiveDate': 'Tanggal berlaku',
    'employeeForm.amount': 'Jumlah',
    'employeeForm.currency': 'Mata uang',
    'employeeForm.reason': 'Alasan',
    'employeeForm.date': 'Tanggal',
    'employeeForm.previousTitle': 'Jabatan sebelumnya',
    'employeeForm.newTitle': 'Jabatan baru',
    'employeeForm.noEntriesYet': 'Belum ada entri.',

    // ── employeeCard ──
    'employeeCard.backToDirectory': '← Kembali ke direktori',
    'employeeCard.editFullProfile': 'Ubah profil lengkap',
    'employeeCard.pendingBanner': 'Anda memiliki {count} permintaan perubahan yang menunggu persetujuan HR.',
    'employeeCard.discipline': 'Bidang keahlian',
    'employeeCard.disciplineNote': 'Perubahan di sini perlu persetujuan HR setelah disimpan.',
    'employeeCard.levelNa': 'Level (t/a)',
    'employeeCard.submitted': 'Terkirim — menunggu persetujuan HR.',
    'employeeCard.addEntry': 'Tambah entri',
    'employeeCard.newEntryNote': 'Entri baru perlu persetujuan HR setelah dikirim.',
    'employeeCard.itemPlaceholder': 'Item (misalnya Blender, Bahasa Indonesia, AWS Certified...)',
    'employeeCard.none': 'Belum ada catatan',
    'employeeCard.removeConfirm': 'Hapus "{item}"?',
    'employeeCard.removalSubmitted': 'Penghapusan terkirim — menunggu persetujuan HR.',
    'employeeCard.category.Software Skill': 'Keahlian Perangkat Lunak',
    'employeeCard.category.Technical Skill': 'Keahlian Teknis',
    'employeeCard.category.Soft Skill': 'Keahlian Non-teknis',
    'employeeCard.category.Language': 'Bahasa',
    'employeeCard.category.Certification': 'Sertifikasi',
    'employeeCard.category.Training Completed': 'Pelatihan Selesai',
    'employeeCard.category.Training Required': 'Pelatihan Diperlukan',
    'employeeCard.category.Career Path': 'Jenjang Karier',

    // ── orgChart ──
    'orgChart.title': 'Struktur organisasi',
    'orgChart.noUnits': 'Belum ada unit organisasi — tambahkan di bawah.',
    'orgChart.reportingLines': 'Garis pelaporan',
    'orgChart.employee': 'Karyawan',
    'orgChart.title_': 'Jabatan',
    'orgChart.reportsTo': 'Melapor ke',
    'orgChart.noReportingLines': 'Belum ada garis pelaporan — atur manager_id pada data karyawan.',
    'orgChart.lead': 'Ketua',
    'orgChart.changeLead': 'Ganti ketua',
    'orgChart.assignLead': 'Tetapkan ketua',
    'orgChart.move': 'Pindahkan',
    'orgChart.reorder': 'Atur ulang urutan',
    'orgChart.delete': 'Hapus',
    'orgChart.noneOption': '— tidak ada —',
    'orgChart.topLevelOption': '— tingkat atas —',
    'orgChart.moving': 'Memindahkan…',
    'orgChart.moveHere': 'Pindahkan ke sini',
    'orgChart.orderPlaceholder': 'Urutan (lebih kecil = lebih awal)',
    'orgChart.deleteConfirm': 'Hapus "{name}"? Ini hanya berhasil jika tidak ada sub-unit di bawahnya.',
    'orgChart.addUnit': 'Tambah perusahaan / departemen / tim',
    'orgChart.unitNamePlaceholder': 'Nama (misalnya RT3D, Creative, Concepts Conveyed Group)',
    'orgChart.noLeadYetOption': '— belum ada ketua —',

    // ── leave ──
    'leave.title': 'Cuti',
    'leave.noRecordHint': 'Login ini tidak terhubung dengan data karyawan, jadi tidak ada cuti pribadi yang ditampilkan — persetujuan dan pengelolaan saldo di bawah tetap berfungsi.',
    'leave.myLeave': 'Cuti saya',
    'leave.type': 'Jenis',
    'leave.cycle': 'Siklus',
    'leave.allocated': 'Dialokasikan',
    'leave.used': 'Terpakai',
    'leave.remaining': 'Sisa',
    'leave.myRequests': 'Permintaan saya',
    'leave.start': 'Mulai',
    'leave.end': 'Selesai',
    'leave.halfDay': 'Setengah hari',
    'leave.status': 'Status',
    'leave.reason': 'Alasan',
    'leave.noRequestsYet': 'Belum ada permintaan.',
    'leave.reasonPlaceholder': 'Alasan',
    'leave.requestLeave': 'Ajukan cuti',
    'leave.submitting': 'Mengirim…',
    'leave.approvals': 'Persetujuan',
    'leave.approve': 'Setujui',
    'leave.reject': 'Tolak',
    'leave.noPendingApprovals': 'Tidak ada persetujuan tertunda.',
    'leave.manageAllocations': 'Kelola alokasi cuti',
    'leave.manageHint':
      'Menentukan berapa hari cuti seseorang untuk siklus saat ini (Tahunan mengikuti tanggal ulang tahun mulai kerja mereka; Sakit dan Darurat mengikuti tahun kalender). Permintaan langsung diblokir begitu alokasi habis — belum ada alokasi berarti belum bisa mengajukan jenis cuti itu sampai diatur di sini.',
    'leave.selectEmployee': '— pilih karyawan —',
    'leave.allocatedDaysPlaceholder': 'Hari yang dialokasikan',

    // ── documents ──
    'documents.title': 'Dokumen',
    'documents.noRecordHint': 'Login ini tidak terhubung dengan data karyawan, jadi tidak ada daftar dokumen pribadi di sini — dokumen perusahaan di bawah tetap berfungsi.',
    'documents.myDocuments': 'Dokumen saya',
    'documents.employeeDocuments': 'Dokumen karyawan',
    'documents.pickAnyoneHint': 'Pilih siapa saja untuk melihat atau menambahkan dokumen pribadi mereka.',
    'documents.selectEmployeeOption': '— pilih karyawan —',
    'documents.type': 'Jenis',
    'documents.link': 'Tautan',
    'documents.expiry': 'Kedaluwarsa',
    'documents.open': 'Buka',
    'documents.noDocuments': 'Belum ada dokumen.',
    'documents.deleteConfirm': 'Hapus catatan dokumen ini? Ini hanya menghapusnya dari dashboard — file aslinya, jika ada di Drive, tidak terpengaruh.',
    'documents.orLinkHint': 'atau',
    'documents.pasteLinkPlaceholder': 'Tempel tautan Google Drive sebagai gantinya',
    'documents.addDocument': 'Tambah dokumen',
    'documents.companyDocuments': 'Dokumen perusahaan',
    'documents.nothingHereYet': 'Belum ada apa pun di sini',
    'documents.addFirstOneHint': ' — tambahkan yang pertama di bawah.',
    'documents.title_': 'Judul',
    'documents.minimumAccess': 'Akses minimum',
    'documents.deleteCompanyConfirm': 'Hapus dokumen perusahaan ini?',
    'documents.titlePlaceholder': 'Judul',
    'documents.accessTierHint':
      'Dokumen dikelompokkan berdasarkan tingkat akses — memilih "Team Lead" menentukan siapa yang bisa melihatnya (Team Lead dan semua di atasnya: Main Lead, HR, Finance, Director, Administrator — Employee biasa tidak bisa) sekaligus folder tempatnya disimpan. Mengunggah file akan menempatkannya di folder Drive otomatis untuk tingkat itu (Company/{role}); menempel tautan akan membiarkannya di tempat asalnya.',

    // ── setup ──
    'setup.welcome': 'Selamat datang, {name}',
    'setup.intro':
      'Sebelum bisa menggunakan aplikasi ini sepenuhnya, luangkan waktu sebentar untuk mengisi data diri dan keahlian Anda di bawah. Setelah mengklik "Selesaikan pengaturan", perubahan selanjutnya pada kartu Anda akan memerlukan persetujuan HR — pengisian pertama ini tidak.',
    'setup.yourDetails': 'Data Anda',
    'setup.confirmNote': 'Kami sudah mengisi data yang tercatat — mohon periksa kebenarannya dan lengkapi apa pun yang kurang atau sudah tidak sesuai.',
    'setup.saveDetails': 'Simpan data',
    'setup.saved': 'Tersimpan.',
    'setup.finish': 'Selesaikan pengaturan dan masuk ke aplikasi',
    'setup.finishing': 'Menyelesaikan…',

    // ── changeRequests ──
    'changeRequests.title': 'Permintaan perubahan',
    'changeRequests.intro': 'Perubahan mandiri pada data profil dan keahlian, dikirim setelah pengaturan awal login pertama masing-masing karyawan — tidak berlaku sampai disetujui.',
    'changeRequests.nothingPending': 'Tidak ada yang tertunda.',
    'changeRequests.notePlaceholder': 'Catatan (opsional)',
    'changeRequests.approve': 'Setujui',
    'changeRequests.reject': 'Tolak',
    'changeRequests.working': 'Memproses…',
    'changeRequests.requestedAt': 'Diajukan {date}',
    'changeRequests.type.profile': 'Pembaruan profil',
    'changeRequests.type.skill_add': 'Keahlian/entri baru',
    'changeRequests.type.skill_update': 'Pembaruan keahlian/entri',
    'changeRequests.type.skill_delete': 'Penghapusan keahlian/entri',
    'changeRequests.blank': '(kosong)',
    'changeRequests.remove': 'Hapus {category}: {item}',
    'changeRequests.levelSuffix': ' — level {level}',
  },
};
