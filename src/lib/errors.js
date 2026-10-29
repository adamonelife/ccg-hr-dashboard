export function safeError(message, language = "en") {
  const text = String(message || "");
  const rules = [
    [
      /Insufficient permissions|field permissions|Only Administrator/i,
      [
        "You don’t have permission for this action.",
        "Anda tidak memiliki izin untuk tindakan ini.",
      ],
    ],
    [
      /Not authenticated/i,
      [
        "Your session has expired. Sign in again.",
        "Sesi Anda telah berakhir. Silakan masuk kembali.",
      ],
    ],
    [
      /Already Approved|Already Rejected/i,
      [
        "This request has already been decided. Refresh the list.",
        "Permintaan ini sudah diputuskan. Perbarui daftar.",
      ],
    ],
    [
      /Insufficient leave balance|only .*remain|request needs/i,
      [
        "There is not enough leave available for this request. Check the allocation and try again.",
        "Saldo cuti tidak mencukupi. Periksa alokasi dan coba lagi.",
      ],
    ],
    [
      /Invalid email or password|Invalid password/i,
      ["Email or password is incorrect.", "Email atau kata sandi salah."],
    ],
    [
      /expired|Invalid or already-used link/i,
      [
        "This setup link is no longer valid. Ask your People administrator for a new link.",
        "Tautan pengaturan ini sudah tidak valid. Minta tautan baru kepada administrator People.",
      ],
    ],
    [
      /Password must be at least 8|Password is required/i,
      [
        "Use a password with at least 8 characters.",
        "Gunakan kata sandi minimal 8 karakter.",
      ],
    ],
    [
      /Not found|no longer exists/i,
      [
        "This record is no longer available. Refresh and try again.",
        "Data ini tidak lagi tersedia. Perbarui dan coba lagi.",
      ],
    ],
  ];
  for (const [pattern, labels] of rules)
    if (pattern.test(text)) return labels[language === "id" ? 1 : 0];
  return language === "id"
    ? "Tindakan belum berhasil. Silakan coba lagi atau hubungi administrator People."
    : "We couldn’t complete that action. Please try again or contact your People administrator.";
}
