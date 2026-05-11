// Bilingual strings (Arabic + English) used across the bot UI.
// Format: "العربي | English" — keeps the interface accessible to all members.

export const L = {
  brand: "✦",

  // ── Status Messages ───────────────────────────────────────
  ok: "تم بنجاح | Done",
  fail: "فشل العملية | Failed",
  loading: "جارٍ التنفيذ… | Processing…",
  unknownError: "صار خطأ غير متوقع، جرّب مرة ثانية | Unexpected error, please try again.",
  notInVoice: "لازم تكون داخل روم صوتي | You must be in a voice channel first.",
  noPermission: "ما تقدر تستخدم هذا الأمر | You don't have permission to use this command.",
  guildOnly: "هذا الأمر للسيرفر فقط | This command is server-only.",
  ownerOnly: "هذا الأمر لمالك البوت فقط | Bot owner only.",

  // ── Recording ─────────────────────────────────────────────
  recording: "التسجيل شغّال | Recording…",
  notRecording: "ما فيه تسجيل شغّال حالياً | No active recording.",
  alreadyRecording: "في تسجيل شغّال فعلاً | Already recording.",
  saved: "تم الحفظ | Saved.",

  // ── Stay Connected ────────────────────────────────────────
  pinned: "البوت مثبّت في الروم | Bot pinned to channel.",
  unpinned: "البوت ما عاد مثبّت | Bot unpinned.",

  // ── Recording Panel ───────────────────────────────────────
  recPanel: "لوحة التسجيل | Recording Panel",
  recStart: "بدء التسجيل | Start Recording",
  recStop: "إيقاف التسجيل | Stop Recording",
  recStatus: "حالة التسجيل | Recording Status",
  clipLast: (m: number) => `كليب آخر ${m} د | Clip last ${m}m`,
  recSettings: "الإعدادات | Settings",

  // ── Setup Panel ───────────────────────────────────────────
  setupTitle: (name: string) => `إعدادات ${name} | ${name} Settings`,
  setupDesc: "اضبط القنوات والريجون من الأسفل — كل تغيير يُحفظ تلقائياً\nAdjust channels & region below — auto-saved.",
  selectRecordChannel: "اختر قناة التسجيل | Select recording channel",
  selectPinChannel: "اختر روم التثبيت | Select 24/7 pin channel",
  selectDuration: (m: number) => `المدة الافتراضية: ${m} دقيقة | Default: ${m} min`,
  selectRegion: (r: string | null) => r ? `الريجون: ${r} | Region: ${r}` : "اختر الريجون | Select Region",
  autoPinLabel: (on: boolean) => `التثبيت التلقائي: ${on ? "مفعّل" : "مغلق"} | Auto-Pin: ${on ? "ON" : "OFF"}`,
  autoRegionLabel: (on: boolean) => `الريجون التلقائي: ${on ? "مفعّل" : "مغلق"} | Auto-Region: ${on ? "ON" : "OFF"}`,
  closePanel: "إغلاق | Close",

  // ── XO Game ───────────────────────────────────────────────
  xoLobbyOpen: "لوبي مفتوح | Open Lobby",
  xoJoin: "انضمام | Join",
  xoCancel: "إلغاء | Cancel",
  xoStarted: "بدأت اللعبة | Game Started",
  xoFinished: "انتهت اللعبة | Game Over",
  xoRound: (c: number, t: number) => `الجولة ${c} من ${t} | Round ${c} of ${t}`,
  xoTurn: (name: string) => `دور ${name} | ${name}'s turn`,
  xoWinner: (name: string) => `الفائز: ${name} | Winner: ${name}`,
  xoDraw: "تعادل | Draw",
  xoMatchDraw: "تعادل بدون فائز | Match ended in a draw",
  xoPointsHint: "استخدموا `/points` لمشاهدة نقاطكم | Use `/points` to see your scores.",

  // ── Connect 4 Game ────────────────────────────────────────
  c4LobbyOpen: "لوبي كونكت 4 مفتوح | Connect 4 Lobby Open",
  c4Join: "انضمام | Join",
  c4Cancel: "إلغاء | Cancel",
  c4Started: "بدأت اللعبة | Game Started",
  c4Finished: "انتهت اللعبة | Game Over",
  c4Turn: (name: string) => `دور ${name} | ${name}'s turn`,
  c4Winner: (name: string) => `الفائز: ${name} | Winner: ${name}`,
  c4Draw: "تعادل — اللوحة امتلأت | Draw — board full",

  // ── RPS Game ──────────────────────────────────────────────
  rpsTitle: "حجر ورقة مقص | Rock Paper Scissors",
  rpsChoose: "اختر سلاحك | Choose your weapon",
  rpsRock: "حجر | Rock",
  rpsPaper: "ورقة | Paper",
  rpsScissors: "مقص | Scissors",
  rpsWin: (name: string) => `فاز ${name} | ${name} wins!`,
  rpsDraw: "تعادل | Draw!",
  rpsWaiting: "بانتظار الخصم | Waiting for opponent…",

  // ── Soundboard ────────────────────────────────────────────
  sbStopRec: "إيقاف التسجيل | Stop Recording",
  sbApprove: "اعتماد + إضافة | Approve & Add",
  sbDiscard: "إلغاء | Discard",
  sbModalTitle: "معلومات الساوند | Sound Info",
  sbNameLabel: "الاسم | Name",
  sbEmojiLabel: "إيموجي (اختياري) | Emoji (optional)",

  // ── Editor ────────────────────────────────────────────────
  edTrimStart: "قص من البداية | Trim Start",
  edTrimEnd: "قص من النهاية | Trim End",
  edRename: "تغيير الاسم | Rename",
  edRender: "نسخة معدّلة | Render Edit",

  // ── Region ────────────────────────────────────────────────
  rgnSwitched: (from: string, to: string) => `تم تبديل الريجون: ${from} → ${to} | Region switched: ${from} → ${to}`,
  rgnFailed: "فشل تبديل الريجون | Region switch failed.",
  rgnCurrent: (r: string) => `الريجون الحالي: ${r} | Current region: ${r}`,
  rgnAuto: "تلقائي | Automatic",

  // ── Voice Fix ─────────────────────────────────────────────
  voiceReconnecting: "جارٍ إعادة الاتصال… | Reconnecting…",
  voiceReconnected: "تم إعادة الاتصال بنجاح | Successfully reconnected.",
  voiceFixApplied: "تم تطبيق الإصلاح | Fix applied.",

  // ── Duration Formatting ───────────────────────────────────
  durationOptions: {
    "5": "5 دقايق | 5 minutes",
    "10": "10 دقايق | 10 minutes",
    "30": "30 دقيقة | 30 minutes",
  } as Record<string, string>,

  formatDuration(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  },

  arabicNumber(n: number): string {
    return n.toString();
  },
} as const;
