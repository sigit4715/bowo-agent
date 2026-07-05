/**
 * i18n-output.ts — Multi-language output system for BOWO agents
 *
 * Zero external deps. ES modules. TypeScript.
 * Supports: ID, EN, ZH, JA, KO, ES, FR, DE
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type SupportedLanguage =
  | 'id'
  | 'en'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'es'
  | 'fr'
  | 'de';

export interface TranslationEntry {
  key: string;
  translations: Record<SupportedLanguage, string>;
}

export interface I18nConfig {
  defaultLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const LANGUAGES: SupportedLanguage[] = [
  'id',
  'en',
  'zh',
  'ja',
  'ko',
  'es',
  'fr',
  'de',
];

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

// ─── Built-in Translations (100+ keys) ─────────────────────────────────────

const BUILTIN_TRANSLATIONS: TranslationEntry[] = [
  // ── System messages ──
  {
    key: 'agent.started',
    translations: {
      id: 'Agen dimulai: {name}',
      en: 'Agent started: {name}',
      zh: '代理已启动：{name}',
      ja: 'エージェント開始: {name}',
      ko: '에이전트 시작: {name}',
      es: 'Agente iniciado: {name}',
      fr: 'Agent démarré : {name}',
      de: 'Agent gestartet: {name}',
    },
  },
  {
    key: 'agent.completed',
    translations: {
      id: 'Agen selesai: {name}',
      en: 'Agent completed: {name}',
      zh: '代理已完成：{name}',
      ja: 'エージェント完了: {name}',
      ko: '에이전트 완료: {name}',
      es: 'Agente completado: {name}',
      fr: 'Agent terminé : {name}',
      de: 'Agent abgeschlossen: {name}',
    },
  },
  {
    key: 'agent.error',
    translations: {
      id: 'Kesalahan agen: {name} — {error}',
      en: 'Agent error: {name} — {error}',
      zh: '代理错误：{name} — {error}',
      ja: 'エージェントエラー: {name} — {error}',
      ko: '에이전트 오류: {name} — {error}',
      es: 'Error de agente: {name} — {error}',
      fr: "Erreur d'agent : {name} — {error}",
      de: 'Agent-Fehler: {name} — {error}',
    },
  },
  {
    key: 'agent.timeout',
    translations: {
      id: 'Agen timeout: {name} ({duration}ms)',
      en: 'Agent timeout: {name} ({duration}ms)',
      zh: '代理超时：{name}（{duration}ms）',
      ja: 'エージェントタイムアウト: {name} ({duration}ms)',
      ko: '에이전트 타임아웃: {name} ({duration}ms)',
      es: 'Tiempo de agente agotado: {name} ({duration}ms)',
      fr: "Délai d'agent dépassé : {name} ({duration}ms)",
      de: 'Agent-Timeout: {name} ({duration}ms)',
    },
  },
  {
    key: 'agent.retrying',
    translations: {
      id: 'Mencoba ulang agen: {name} (percobaan {attempt}/{max})',
      en: 'Retrying agent: {name} (attempt {attempt}/{max})',
      zh: '重试代理：{name}（第 {attempt}/{max} 次）',
      ja: 'エージェント再試行: {name} (試行 {attempt}/{max})',
      ko: '에이전트 재시도: {name} (시도 {attempt}/{max})',
      es: 'Reintentando agente: {name} (intento {attempt}/{max})',
      fr: "Nouvelle tentative de l'agent : {name} (tentative {attempt}/{max})",
      de: 'Agent-Wiederholung: {name} (Versuch {attempt}/{max})',
    },
  },
  {
    key: 'combo.fallback',
    translations: {
      id: 'Menggunakan agen fallback: {name}',
      en: 'Using fallback agent: {name}',
      zh: '使用备用代理：{name}',
      ja: 'フォールバックエージェント使用: {name}',
      ko: '폴백 에이전트 사용: {name}',
      es: 'Usando agente de respaldo: {name}',
      fr: "Utilisation de l'agent de secours : {name}",
      de: 'Fallback-Agent wird verwendet: {name}',
    },
  },
  {
    key: 'combo.started',
    translations: {
      id: 'Kombinasi dimulai: {combo}',
      en: 'Combo started: {combo}',
      zh: '组合已启动：{combo}',
      ja: 'コンボ開始: {combo}',
      ko: '콤보 시작: {combo}',
      es: 'Combo iniciado: {combo}',
      fr: 'Combo démarré : {combo}',
      de: 'Kombination gestartet: {combo}',
    },
  },
  {
    key: 'combo.completed',
    translations: {
      id: 'Kombinasi selesai: {combo}',
      en: 'Combo completed: {combo}',
      zh: '组合已完成：{combo}',
      ja: 'コンボ完了: {combo}',
      ko: '콤보 완료: {combo}',
      es: 'Combo completado: {combo}',
      fr: 'Combo terminé : {combo}',
      de: 'Kombination abgeschlossen: {combo}',
    },
  },
  {
    key: 'pool.rotation',
    translations: {
      id: 'Rotasi pool: mengganti dari {from} ke {to}',
      en: 'Pool rotation: switching from {from} to {to}',
      zh: '池轮换：从 {from} 切换到 {to}',
      ja: 'プールローテーション: {from} から {to} に切替',
      ko: '풀 로테이션: {from}에서 {to}로 전환',
      es: 'Rotación de pool: cambiando de {from} a {to}',
      fr: 'Rotation du pool : passage de {from} à {to}',
      de: 'Pool-Rotation: Wechsel von {from} zu {to}',
    },
  },
  {
    key: 'pool.exhausted',
    translations: {
      id: 'Pool kehabisan agen yang tersedia',
      en: 'Pool exhausted — no agents available',
      zh: '池已耗尽 — 无可用代理',
      ja: 'プール枯渇 — 利用可能なエージェントなし',
      ko: '풀 소진 — 사용 가능한 에이전트 없음',
      es: 'Pool agotado — no hay agentes disponibles',
      fr: 'Pool épuisé — aucun agent disponible',
      de: 'Pool erschöpft — keine Agents verfügbar',
    },
  },
  {
    key: 'system.initialized',
    translations: {
      id: 'Sistem diinisialisasi',
      en: 'System initialized',
      zh: '系统已初始化',
      ja: 'システム初期化完了',
      ko: '시스템 초기화 완료',
      es: 'Sistema inicializado',
      fr: 'Système initialisé',
      de: 'System initialisiert',
    },
  },
  {
    key: 'system.shutdown',
    translations: {
      id: 'Sistem sedang dimatikan',
      en: 'System is shutting down',
      zh: '系统正在关闭',
      ja: 'システムをシャットダウン中',
      ko: '시스템 종료 중',
      es: 'El sistema se está apagando',
      fr: "Le système s'arrête",
      de: 'System wird heruntergefahren',
    },
  },
  {
    key: 'system.ready',
    translations: {
      id: 'Sistem siap',
      en: 'System ready',
      zh: '系统就绪',
      ja: 'システム準備完了',
      ko: '시스템 준비 완료',
      es: 'Sistema listo',
      fr: 'Système prêt',
      de: 'System bereit',
    },
  },
  {
    key: 'system.health.ok',
    translations: {
      id: 'Kesehatan sistem: normal',
      en: 'System health: normal',
      zh: '系统健康：正常',
      ja: 'システムヘルス: 正常',
      ko: '시스템 상태: 정상',
      es: 'Estado del sistema: normal',
      fr: 'Santé du système : normal',
      de: 'Systemzustand: normal',
    },
  },
  {
    key: 'system.health.degraded',
    translations: {
      id: 'Kesehatan sistem: terdegradasi',
      en: 'System health: degraded',
      zh: '系统健康：降级',
      ja: 'システムヘルス: 低下',
      ko: '시스템 상태: 저하됨',
      es: 'Estado del sistema: degradado',
      fr: 'Santé du système : dégradé',
      de: 'Systemzustand: beeinträchtigt',
    },
  },

  // ── UI strings ──
  {
    key: 'welcome',
    translations: {
      id: 'Selamat datang di BOWO!',
      en: 'Welcome to BOWO!',
      zh: '欢迎使用 BOWO！',
      ja: 'BOWOへようこそ！',
      ko: 'BOWO에 오신 것을 환영합니다!',
      es: '¡Bienvenido a BOWO!',
      fr: 'Bienvenue sur BOWO !',
      de: 'Willkommen bei BOWO!',
    },
  },
  {
    key: 'welcome.user',
    translations: {
      id: 'Selamat datang kembali, {name}!',
      en: 'Welcome back, {name}!',
      zh: '欢迎回来，{name}！',
      ja: 'おかえりなさい、{name}！',
      ko: '다시 오신 것을 환영합니다, {name}!',
      es: '¡Bienvenido de nuevo, {name}!',
      fr: 'Bon retour, {name} !',
      de: 'Willkommen zurück, {name}!',
    },
  },
  {
    key: 'goodbye',
    translations: {
      id: 'Sampai jumpa!',
      en: 'Goodbye!',
      zh: '再见！',
      ja: 'さようなら！',
      ko: '안녕히 가세요!',
      es: '¡Adiós!',
      fr: 'Au revoir !',
      de: 'Auf Wiedersehen!',
    },
  },
  {
    key: 'goodbye.user',
    translations: {
      id: 'Sampai jumpa lagi, {name}!',
      en: 'See you later, {name}!',
      zh: '再见，{name}！',
      ja: 'またね、{name}！',
      ko: '또 만나요, {name}!',
      es: '¡Hasta luego, {name}!',
      fr: 'À plus, {name} !',
      de: 'Bis später, {name}!',
    },
  },
  {
    key: 'help.header',
    translations: {
      id: '📋 Bantuan BOWO',
      en: '📋 BOWO Help',
      zh: '📋 BOWO 帮助',
      ja: '📋 BOWO ヘルプ',
      ko: '📋 BOWO 도움말',
      es: '📋 Ayuda de BOWO',
      fr: '📋 Aide BOWO',
      de: '📋 BOWO-Hilfe',
    },
  },
  {
    key: 'help.agent.list',
    translations: {
      id: 'Gunakan /agents untuk melihat agen yang tersedia.',
      en: 'Use /agents to see available agents.',
      zh: '使用 /agents 查看可用代理。',
      ja: '/agents で利用可能なエージェントを確認できます。',
      ko: '/agents를 사용하여 사용 가능한 에이전트를 확인하세요.',
      es: 'Usa /agents para ver los agentes disponibles.',
      fr: 'Utilisez /agents pour voir les agents disponibles.',
      de: 'Verwende /agents, um verfügbare Agents anzuzeigen.',
    },
  },
  {
    key: 'help.combo.list',
    translations: {
      id: 'Gunakan /combos untuk melihat combo yang tersedia.',
      en: 'Use /combos to see available combos.',
      zh: '使用 /combos 查看可用组合。',
      ja: '/combos で利用可能なコンボを確認できます。',
      ko: '/combos를 사용하여 사용 가능한 콤보를 확인하세요.',
      es: 'Usa /combos para ver los combos disponibles.',
      fr: 'Utilisez /combos pour voir les combos disponibles.',
      de: 'Verwende /combos, um verfügbare Kombinationen anzuzeigen.',
    },
  },
  {
    key: 'help.stats',
    translations: {
      id: 'Gunakan /stats untuk melihat statistik.',
      en: 'Use /stats to see statistics.',
      zh: '使用 /stats 查看统计信息。',
      ja: '/stats で統計を確認できます。',
      ko: '/stats를 사용하여 통계를 확인하세요.',
      es: 'Usa /stats para ver estadísticas.',
      fr: 'Utilisez /stats pour voir les statistiques.',
      de: 'Verwende /stats, um Statistiken anzuzeigen.',
    },
  },
  {
    key: 'help.language',
    translations: {
      id: 'Gunakan /lang untuk mengubah bahasa.',
      en: 'Use /lang to change language.',
      zh: '使用 /lang 切换语言。',
      ja: '/lang で言語を変更できます。',
      ko: '/lang를 사용하여 언어를 변경하세요.',
      es: 'Usa /lang para cambiar el idioma.',
      fr: 'Utilisez /lang pour changer la langue.',
      de: 'Verwende /lang, um die Sprache zu ändern.',
    },
  },
  {
    key: 'stats.header',
    translations: {
      id: '📊 Statistik BOWO',
      en: '📊 BOWO Statistics',
      zh: '📊 BOWO 统计',
      ja: '📊 BOWO 統計',
      ko: '📊 BOWO 통계',
      es: '📊 Estadísticas de BOWO',
      fr: '📊 Statistiques BOWO',
      de: '📊 BOWO-Statistiken',
    },
  },
  {
    key: 'stats.total.requests',
    translations: {
      id: 'Total permintaan: {count}',
      en: 'Total requests: {count}',
      zh: '总请求数：{count}',
      ja: '総リクエスト数: {count}',
      ko: '총 요청 수: {count}',
      es: 'Total de solicitudes: {count}',
      fr: 'Total des requêtes : {count}',
      de: 'Gesamtanfragen: {count}',
    },
  },
  {
    key: 'stats.success.rate',
    translations: {
      id: 'Tingkat keberhasilan: {rate}%',
      en: 'Success rate: {rate}%',
      zh: '成功率：{rate}%',
      ja: '成功率: {rate}%',
      ko: '성공률: {rate}%',
      es: 'Tasa de éxito: {rate}%',
      fr: 'Taux de réussite : {rate}%',
      de: 'Erfolgsquote: {rate}%',
    },
  },
  {
    key: 'stats.avg.response.time',
    translations: {
      id: 'Waktu respons rata-rata: {time}ms',
      en: 'Average response time: {time}ms',
      zh: '平均响应时间：{time}ms',
      ja: '平均レスポンスタイム: {time}ms',
      ko: '평균 응답 시간: {time}ms',
      es: 'Tiempo promedio de respuesta: {time}ms',
      fr: 'Temps de réponse moyen : {time}ms',
      de: 'Durchschnittliche Antwortzeit: {time}ms',
    },
  },
  {
    key: 'stats.active.agents',
    translations: {
      id: 'Agen aktif: {count}',
      en: 'Active agents: {count}',
      zh: '活跃代理数：{count}',
      ja: 'アクティブエージェント数: {count}',
      ko: '활성 에이전트 수: {count}',
      es: 'Agentes activos: {count}',
      fr: 'Agents actifs : {count}',
      de: 'Aktive Agents: {count}',
    },
  },
  {
    key: 'stats.queue.depth',
    translations: {
      id: 'Kedalaman antrean: {count}',
      en: 'Queue depth: {count}',
      zh: '队列深度：{count}',
      ja: 'キュー深度: {count}',
      ko: '대기열 깊이: {count}',
      es: 'Profundidad de cola: {count}',
      fr: 'Profondeur de la file : {count}',
      de: 'Warteschlangentiefe: {count}',
    },
  },
  {
    key: 'status.online',
    translations: {
      id: '🟢 Status: Online',
      en: '🟢 Status: Online',
      zh: '🟢 状态：在线',
      ja: '🟢 ステータス: オンライン',
      ko: '🟢 상태: 온라인',
      es: '🟢 Estado: En línea',
      fr: '🟢 Statut : En ligne',
      de: '🟢 Status: Online',
    },
  },
  {
    key: 'status.offline',
    translations: {
      id: '🔴 Status: Offline',
      en: '🔴 Status: Offline',
      zh: '🔴 状态：离线',
      ja: '🔴 ステータス: オフライン',
      ko: '🔴 상태: 오프라인',
      es: '🔴 Estado: Sin conexión',
      fr: '🟢 Statut : Hors ligne',
      de: '🔴 Status: Offline',
    },
  },

  // ── Error messages ──
  {
    key: 'error.not_found',
    translations: {
      id: 'Tidak ditemukan: {resource}',
      en: 'Not found: {resource}',
      zh: '未找到：{resource}',
      ja: '見つかりません: {resource}',
      ko: '찾을 수 없음: {resource}',
      es: 'No encontrado: {resource}',
      fr: 'Introuvable : {resource}',
      de: 'Nicht gefunden: {resource}',
    },
  },
  {
    key: 'error.permission',
    translations: {
      id: 'Akses ditolak: Anda tidak memiliki izin untuk {action}',
      en: 'Access denied: you do not have permission to {action}',
      zh: '访问被拒绝：您没有权限{action}',
      ja: 'アクセス拒否: {action}する権限がありません',
      ko: '접근 거부: {action}에 대한 권한이 없습니다',
      es: 'Acceso denegado: no tiene permiso para {action}',
      fr: "Accès refusé : vous n'avez pas la permission de {action}",
      de: 'Zugriff verweigert: Keine Berechtigung für {action}',
    },
  },
  {
    key: 'error.rate_limit',
    translations: {
      id: 'Batas laju terlampaui. Coba lagi dalam {seconds} detik.',
      en: 'Rate limit exceeded. Try again in {seconds} seconds.',
      zh: '速率限制已超过。请在 {seconds} 秒后重试。',
      ja: 'レート制限を超過しました。{seconds}秒後に再試行してください。',
      ko: '속도 제한을 초과했습니다. {seconds}초 후에 다시 시도하세요.',
      es: 'Límite de velocidad excedido. Inténtalo de nuevo en {seconds} segundos.',
      fr: 'Limite de débit dépassée. Réessayez dans {seconds} secondes.',
      de: 'Ratenlimit überschritten. In {seconds} Sekunden erneut versuchen.',
    },
  },
  {
    key: 'error.invalid.input',
    translations: {
      id: 'Input tidak valid: {details}',
      en: 'Invalid input: {details}',
      zh: '输入无效：{details}',
      ja: '無効な入力: {details}',
      ko: '잘못된 입력: {details}',
      es: 'Entrada no válida: {details}',
      fr: 'Entrée invalide : {details}',
      de: 'Ungültige Eingabe: {details}',
    },
  },
  {
    key: 'error.internal',
    translations: {
      id: 'Kesalahan internal. Silakan hubungi administrator.',
      en: 'Internal error. Please contact the administrator.',
      zh: '内部错误。请联系管理员。',
      ja: '内部エラー。管理者に連絡してください。',
      ko: '내부 오류입니다. 관리자에게 문의하세요.',
      es: 'Error interno. Contacte al administrador.',
      fr: 'Erreur interne. Veuillez contacter l\'administrateur.',
      de: 'Interner Fehler. Bitte kontaktieren Sie den Administrator.',
    },
  },
  {
    key: 'error.agent.unavailable',
    translations: {
      id: 'Agen "{name}" tidak tersedia saat ini.',
      en: 'Agent "{name}" is currently unavailable.',
      zh: '代理 "{name}" 当前不可用。',
      ja: 'エージェント「{name}」は現在利用できません。',
      ko: '에이전트 "{name}"은(는) 현재 사용할 수 없습니다.',
      es: 'El agente "{name}" no está disponible actualmente.',
      fr: 'L\'agent "{name}" est actuellement indisponible.',
      de: 'Agent "{name}" ist derzeit nicht verfügbar.',
    },
  },
  {
    key: 'error.agent.crashed',
    translations: {
      id: 'Agen "{name}" mengalami crash.',
      en: 'Agent "{name}" has crashed.',
      zh: '代理 "{name}" 已崩溃。',
      ja: 'エージェント「{name}」がクラッシュしました。',
      ko: '에이전트 "{name}"이(가) 비정상 종료되었습니다.',
      es: 'El agente "{name}" se ha bloqueado.',
      fr: 'L\'agent "{name}" s\'est arrêté de façon inattendue.',
      de: 'Agent "{name}" ist abgestürzt.',
    },
  },
  {
    key: 'error.agent.no.response',
    translations: {
      id: 'Agen "{name}" tidak memberikan respons.',
      en: 'Agent "{name}" did not respond.',
      zh: '代理 "{name}" 未响应。',
      ja: 'エージェント「{name}」が応答しませんでした。',
      ko: '에이전트 "{name}"이(가) 응답하지 않았습니다.',
      es: 'El agente "{name}" no respondió.',
      fr: 'L\'agent "{name}" n\'a pas répondu.',
      de: 'Agent "{name}" hat nicht geantwortet.',
    },
  },
  {
    key: 'error.parser.failed',
    translations: {
      id: 'Gagal mengurai output agen.',
      en: 'Failed to parse agent output.',
      zh: '解析代理输出失败。',
      ja: 'エージェント出力の解析に失敗しました。',
      ko: '에이전트 출력 파싱 실패.',
      es: 'Error al analizar la salida del agente.',
      fr: "Échec de l'analyse de la sortie de l'agent.",
      de: 'Agent-Ausgabe konnte nicht verarbeitet werden.',
    },
  },
  {
    key: 'error.combo.incomplete',
    translations: {
      id: 'Kombinasi tidak lengkap: langkah {step} gagal.',
      en: 'Combo incomplete: step {step} failed.',
      zh: '组合未完成：步骤 {step} 失败。',
      ja: 'コンボ未完了: ステップ{step}が失敗しました。',
      ko: '콤보 미완료: 단계 {step} 실패.',
      es: 'Combo incompleto: paso {step} falló.',
      fr: 'Combo incomplet : étape {step} a échoué.',
      de: 'Kombination unvollständig: Schritt {step} fehlgeschlagen.',
    },
  },
  {
    key: 'error.queue.full',
    translations: {
      id: 'Antrean penuh. Coba lagi nanti.',
      en: 'Queue is full. Please try again later.',
      zh: '队列已满。请稍后重试。',
      ja: 'キューが満杯です。後でもう一度お試しください。',
      ko: '대기열이 가득 찼습니다. 나중에 다시 시도하세요.',
      es: 'La cola está llena. Inténtalo de nuevo más tarde.',
      fr: 'La file est pleine. Veuillez réessayer plus tard.',
      de: 'Warteschlange ist voll. Bitte versuchen Sie es später erneut.',
    },
  },
  {
    key: 'error.config.invalid',
    translations: {
      id: 'Konfigurasi tidak valid: {details}',
      en: 'Invalid configuration: {details}',
      zh: '配置无效：{details}',
      ja: '無効な設定: {details}',
      ko: '잘못된 구성: {details}',
      es: 'Configuración no válida: {details}',
      fr: 'Configuration invalide : {details}',
      de: 'Ungültige Konfiguration: {details}',
    },
  },
  {
    key: 'error.auth.required',
    translations: {
      id: 'Autentikasi diperlukan.',
      en: 'Authentication required.',
      zh: '需要身份验证。',
      ja: '認証が必要です。',
      ko: '인증이 필요합니다.',
      es: 'Autenticación requerida.',
      fr: 'Authentification requise.',
      de: 'Authentifizierung erforderlich.',
    },
  },
  {
    key: 'error.auth.failed',
    translations: {
      id: 'Autentikasi gagal.',
      en: 'Authentication failed.',
      zh: '身份验证失败。',
      ja: '認証に失敗しました。',
      ko: '인증에 실패했습니다.',
      es: 'Error de autenticación.',
      fr: "Échec de l'authentification.",
      de: 'Authentifizierung fehlgeschlagen.',
    },
  },
  {
    key: 'error.connection',
    translations: {
      id: 'Gagal terhubung ke {target}.',
      en: 'Failed to connect to {target}.',
      zh: '连接 {target} 失败。',
      ja: '{target}への接続に失敗しました。',
      ko: '{target} 연결 실패.',
      es: 'Error al conectar con {target}.',
      fr: 'Échec de la connexion à {target}.',
      de: 'Verbindung zu {target} fehlgeschlagen.',
    },
  },
  {
    key: 'error.timeout',
    translations: {
      id: 'Operasi melebihi batas waktu ({timeout}ms).',
      en: 'Operation timed out ({timeout}ms).',
      zh: '操作超时（{timeout}ms）。',
      ja: '操作がタイムアウトしました（{timeout}ms）。',
      ko: '작업이 시간 초과되었습니다 ({timeout}ms).',
      es: 'La operación excedió el tiempo ({timeout}ms).',
      fr: "L'opération a dépassé le délai ({timeout}ms).",
      de: 'Operation-Timeout ({timeout}ms).',
    },
  },
  {
    key: 'error.memory',
    translations: {
      id: 'Kekurangan memori.',
      en: 'Out of memory.',
      zh: '内存不足。',
      ja: 'メモリ不足。',
      ko: '메모리 부족.',
      es: 'Sin memoria disponible.',
      fr: 'Mémoire insuffisante.',
      de: 'Nicht genügend Speicher.',
    },
  },

  // ── Agent responses ──
  {
    key: 'response.planning',
    translations: {
      id: '🧠 Merencanakan pendekatan...',
      en: '🧠 Planning approach...',
      zh: '🧠 正在规划方案...',
      ja: '🧠 アプローチを計画中...',
      ko: '🧠 접근 방식 계획 중...',
      es: '🧠 Planificando enfoque...',
      fr: '🧠 Planification de l\'approche...',
      de: '🧠 Ansatz wird geplant...',
    },
  },
  {
    key: 'response.analyzing',
    translations: {
      id: '🔍 Menganalisis data...',
      en: '🔍 Analyzing data...',
      zh: '🔍 正在分析数据...',
      ja: '🔍 データを分析中...',
      ko: '🔍 데이터 분석 중...',
      es: '🔍 Analizando datos...',
      fr: '🔍 Analyse des données...',
      de: '🔍 Daten werden analysiert...',
    },
  },
  {
    key: 'response.generating',
    translations: {
      id: '⚡ Menghasilkan respons...',
      en: '⚡ Generating response...',
      zh: '⚡ 正在生成回复...',
      ja: '⚡ 応答を生成中...',
      ko: '⚡ 응답 생성 중...',
      es: '⚡ Generando respuesta...',
      fr: '⚡ Génération de la réponse...',
      de: '⚡ Antwort wird generiert...',
    },
  },
  {
    key: 'response.processing',
    translations: {
      id: '⚙️ Memproses permintaan Anda...',
      en: '⚙️ Processing your request...',
      zh: '⚙️ 正在处理您的请求...',
      ja: '⚙️ リクエストを処理中...',
      ko: '⚙️ 요청을 처리 중...',
      es: '⚙️ Procesando su solicitud...',
      fr: '⚙️ Traitement de votre demande...',
      de: '⚙️ Ihre Anfrage wird verarbeitet...',
    },
  },
  {
    key: 'response.success',
    translations: {
      id: '✅ Selesai!',
      en: '✅ Done!',
      zh: '✅ 完成！',
      ja: '✅ 完了！',
      ko: '✅ 완료!',
      es: '✅ ¡Listo!',
      fr: '✅ Terminé !',
      de: '✅ Fertig!',
    },
  },
  {
    key: 'response.error',
    translations: {
      id: '❌ Terjadi kesalahan: {error}',
      en: '❌ An error occurred: {error}',
      zh: '❌ 发生错误：{error}',
      ja: '❌ エラーが発生しました: {error}',
      ko: '❌ 오류가 발생했습니다: {error}',
      es: '❌ Ocurrió un error: {error}',
      fr: '❌ Une erreur s\'est produite : {error}',
      de: '❌ Ein Fehler ist aufgetreten: {error}',
    },
  },
  {
    key: 'response.partial',
    translations: {
      id: '⚠️ Hasil parsial (proses belum selesai)',
      en: '⚠️ Partial result (processing incomplete)',
      zh: '⚠️ 部分结果（处理未完成）',
      ja: '⚠️ 部分的な結果（処理未完了）',
      ko: '⚠️ 부분 결과 (처리 미완료)',
      es: '⚠️ Resultado parcial (proceso incompleto)',
      fr: '⚠️ Résultat partiel (traitement incomplet)',
      de: '⚠️ Teilweises Ergebnis (Verarbeitung unvollständig)',
    },
  },
  {
    key: 'response.cached',
    translations: {
      id: '💾 Hasil dari cache',
      en: '💾 Result from cache',
      zh: '💾 缓存中的结果',
      ja: '💾 キャッシュからの結果',
      ko: '💾 캐시에서 가져온 결과',
      es: '💾 Resultado del caché',
      fr: '💾 Résultat du cache',
      de: '💾 Ergebnis aus dem Cache',
    },
  },
  {
    key: 'response.retry',
    translations: {
      id: '🔄 Mencoba ulang ({attempt}/{max})...',
      en: '🔄 Retrying ({attempt}/{max})...',
      zh: '🔄 正在重试（{attempt}/{max}）...',
      ja: '🔄 再試行中 ({attempt}/{max})...',
      ko: '🔄 재시도 중 ({attempt}/{max})...',
      es: '🔄 Reintentando ({attempt}/{max})...',
      fr: '🔄 Nouvelle tentative ({attempt}/{max})...',
      de: '🔄 Wiederholung ({attempt}/{max})...',
    },
  },
  {
    key: 'response.queued',
    translations: {
      id: '📥 Permintaan Anda masuk anrean (posisi {position})',
      en: '📥 Your request is queued (position {position})',
      zh: '📥 您的请求已排队（位置 {position}）',
      ja: '📥 リクエストがキューに追加されました（位置 {position}）',
      ko: '📥 요청이 대기열에 추가되었습니다 (위치 {position})',
      es: '📥 Su solicitud está en cola (posición {position})',
      fr: '📥 Votre demande est en file d\'attente (position {position})',
      de: '📥 Ihre Anfrage ist in der Warteschlange (Position {position})',
    },
  },
  {
    key: 'response.language.changed',
    translations: {
      id: '🌐 Bahasa diubah ke {language}',
      en: '🌐 Language changed to {language}',
      zh: '🌐 语言已更改为 {language}',
      ja: '🌐 言語が{language}に変更されました',
      ko: '🌐 언어가 {language}(으)로 변경되었습니다',
      es: '🌐 Idioma cambiado a {language}',
      fr: '🌐 Langue changée en {language}',
      de: '🌐 Sprache geändert zu {language}',
    },
  },
  {
    key: 'response.confirm',
    translations: {
      id: 'Konfirmasi diperlukan: {message}',
      en: 'Confirmation required: {message}',
      zh: '需要确认：{message}',
      ja: '確認が必要です: {message}',
      ko: '확인이 필요합니다: {message}',
      es: 'Confirmación requerida: {message}',
      fr: 'Confirmation requise : {message}',
      de: 'Bestätigung erforderlich: {message}',
    },
  },
  {
    key: 'response.progress',
    translations: {
      id: '📊 Kemajuan: {percent}% selesai',
      en: '📊 Progress: {percent}% complete',
      zh: '📊 进度：已完成 {percent}%',
      ja: '📊 進捗: {percent}% 完了',
      ko: '📊 진행률: {percent}% 완료',
      es: '📊 Progreso: {percent}% completado',
      fr: '📊 Progression : {percent}% terminé',
      de: '📊 Fortschritt: {percent}% abgeschlossen',
    },
  },

  // ── Agent names & metadata ──
  {
    key: 'agent.name.grounding',
    translations: {
      id: 'Grounding',
      en: 'Grounding',
      zh: '锚定',
      ja: 'グラウンディング',
      ko: '그라운딩',
      es: 'Grounding',
      fr: 'Grounding',
      de: 'Grounding',
    },
  },
  {
    key: 'agent.name.orchestrator',
    translations: {
      id: 'Orkestrator',
      en: 'Orchestrator',
      zh: '编排器',
      ja: 'オーケストレーター',
      ko: '오케스트레이터',
      es: 'Orquestador',
      fr: 'Orchestrateur',
      de: 'Orchestrator',
    },
  },
  {
    key: 'agent.name.code',
    translations: {
      id: 'Agen Kode',
      en: 'Code Agent',
      zh: '代码代理',
      ja: 'コードエージェント',
      ko: '코드 에이전트',
      es: 'Agente de Código',
      fr: 'Agent de Code',
      de: 'Code-Agent',
    },
  },
  {
    key: 'agent.name.data',
    translations: {
      id: 'Agen Data',
      en: 'Data Agent',
      zh: '数据代理',
      ja: 'データエージェント',
      ko: '데이터 에이전트',
      es: 'Agente de Datos',
      fr: 'Agent de Données',
      de: 'Daten-Agent',
    },
  },
  {
    key: 'agent.name.research',
    translations: {
      id: 'Agen Riset',
      en: 'Research Agent',
      zh: '研究代理',
      ja: 'リサーチエージェント',
      ko: '리서치 에이전트',
      es: 'Agente de Investigación',
      fr: 'Agent de Recherche',
      de: 'Recherche-Agent',
    },
  },
  {
    key: 'agent.name.writing',
    translations: {
      id: 'Agen Penulisan',
      en: 'Writing Agent',
      zh: '写作代理',
      ja: 'ライティングエージェント',
      ko: '라이팅 에이전트',
      es: 'Agente de Escritura',
      fr: 'Agent d\'Écriture',
      de: 'Schreib-Agent',
    },
  },
  {
    key: 'agent.name.creative',
    translations: {
      id: 'Agen Kreatif',
      en: 'Creative Agent',
      zh: '创意代理',
      ja: 'クリエイティブエージェント',
      ko: '크리에이티브 에이전트',
      es: 'Agente Creativo',
      fr: 'Agent Créatif',
      de: 'Kreativ-Agent',
    },
  },

  // ── Combo descriptions ──
  {
    key: 'combo.name.search-and-write',
    translations: {
      id: 'Penelusuran & Tulisan',
      en: 'Search & Write',
      zh: '搜索与写作',
      ja: '検索＆執筆',
      ko: '검색 및 작성',
      es: 'Buscar y Escribir',
      fr: 'Recherche & Rédaction',
      de: 'Suchen & Schreiben',
    },
  },
  {
    key: 'combo.name.analyze-and-respond',
    translations: {
      id: 'Analisis & Respons',
      en: 'Analyze & Respond',
      zh: '分析与回复',
      ja: '分析＆応答',
      ko: '분석 및 응답',
      es: 'Analizar y Responder',
      fr: 'Analyser et Répondre',
      de: 'Analysieren & Antworten',
    },
  },
  {
    key: 'combo.name.full-pipeline',
    translations: {
      id: 'Pipeline Lengkap',
      en: 'Full Pipeline',
      zh: '完整流程',
      ja: 'フルパイプライン',
      ko: '풀 파이프라인',
      es: 'Pipeline Completo',
      fr: 'Pipeline Complet',
      de: 'Vollständige Pipeline',
    },
  },

  // ── Misc ──
  {
    key: 'misc.no.agent',
    translations: {
      id: 'Tidak ada agen yang tersedia untuk tugas ini.',
      en: 'No agent available for this task.',
      zh: '没有适用于此任务的代理。',
      ja: 'このタスクに利用可能なエージェントがありません。',
      ko: '이 작업에 사용 가능한 에이전트가 없습니다.',
      es: 'No hay agente disponible para esta tarea.',
      fr: 'Aucun agent disponible pour cette tâche.',
      de: 'Kein Agent für diese Aufgabe verfügbar.',
    },
  },
  {
    key: 'misc.cancelled',
    translations: {
      id: 'Operasi dibatalkan.',
      en: 'Operation cancelled.',
      zh: '操作已取消。',
      ja: '操作がキャンセルされました。',
      ko: '작업이 취소되었습니다.',
      es: 'Operación cancelada.',
      fr: 'Opération annulée.',
      de: 'Operation abgebrochen.',
    },
  },
  {
    key: 'misc.unsupported.action',
    translations: {
      id: 'Aksi tidak didukung: {action}',
      en: 'Unsupported action: {action}',
      zh: '不支持的操作：{action}',
      ja: 'サポートされていないアクション: {action}',
      ko: '지원되지 않는 작업: {action}',
      es: 'Acción no soportada: {action}',
      fr: 'Action non supportée : {action}',
      de: 'Nicht unterstützte Aktion: {action}',
    },
  },
  {
    key: 'misc.version',
    translations: {
      id: 'Versi: {version}',
      en: 'Version: {version}',
      zh: '版本：{version}',
      ja: 'バージョン: {version}',
      ko: '버전: {version}',
      es: 'Versión: {version}',
      fr: 'Version : {version}',
      de: 'Version: {version}',
    },
  },
  {
    key: 'misc.uptime',
    translations: {
      id: 'Waktu aktif: {uptime}',
      en: 'Uptime: {uptime}',
      zh: '运行时间：{uptime}',
      ja: '稼働時間: {uptime}',
      ko: '가동 시간: {uptime}',
      es: 'Tiempo activo: {uptime}',
      fr: 'Temps en service : {uptime}',
      de: 'Laufzeit: {uptime}',
    },
  },
  {
    key: 'misc.license',
    translations: {
      id: 'Lisensi: {license}',
      en: 'License: {license}',
      zh: '许可证：{license}',
      ja: 'ライセンス: {license}',
      ko: '라이선스: {license}',
      es: 'Licencia: {license}',
      fr: 'Licence : {license}',
      de: 'Lizenz: {license}',
    },
  },
  {
    key: 'misc.update.available',
    translations: {
      id: 'Pembaruan tersedia: v{version}',
      en: 'Update available: v{version}',
      zh: '有可用更新：v{version}',
      ja: 'アップデートがあります: v{version}',
      ko: '업데이트 가능: v{version}',
      es: 'Actualización disponible: v{version}',
      fr: 'Mise à jour disponible : v{version}',
      de: 'Update verfügbar: v{version}',
    },
  },
  {
    key: 'misc.deprecated',
    translations: {
      id: '⚠️ Fitur "{feature}" sudah usang dan akan dihapus.',
      en: '⚠️ Feature "{feature}" is deprecated and will be removed.',
      zh: '⚠️ 功能 "{feature}" 已弃用，将被移除。',
      ja: '⚠️ 機能「{feature}」は非推奨です。削除されます。',
      ko: '⚠️ 기능 "{feature}"은(는) 더 이상 사용되지 않으며 제거됩니다.',
      es: '⚠️ La función "{feature}" está obsoleta y será eliminada.',
      fr: '⚠️ La fonctionnalité "{feature}" est obsolète et sera supprimée.',
      de: '⚠️ Funktion "{feature}" ist veraltet und wird entfernt.',
    },
  },
  {
    key: 'misc.copy.to.clipboard',
    translations: {
      id: '📋 Disalin ke papan klip.',
      en: '📋 Copied to clipboard.',
      zh: '📋 已复制到剪贴板。',
      ja: '📋 クリップボードにコピーしました。',
      ko: '📋 클립보드에 복사되었습니다.',
      es: '📋 Copiado al portapapeles.',
      fr: '📋 Copié dans le presse-papiers.',
      de: '📋 In die Zwischenablage kopiert.',
    },
  },
  {
    key: 'misc.permission.granted',
    translations: {
      id: '✅ Izin diberikan untuk {action}.',
      en: '✅ Permission granted for {action}.',
      zh: '✅ 已授权 {action}。',
      ja: '✅ {action}の権限が付与されました。',
      ko: '✅ {action}에 대한 권한이 부여되었습니다.',
      es: '✅ Permiso concedido para {action}.',
      fr: '✅ Permission accordée pour {action}.',
      de: '✅ Berechtigung erteilt für {action}.',
    },
  },
  {
    key: 'misc.permission.revoked',
    translations: {
      id: '🔒 Izin dicabut untuk {action}.',
      en: '🔒 Permission revoked for {action}.',
      zh: '🔒 已撤销 {action} 的权限。',
      ja: '🔒 {action}の権限が取り消されました。',
      ko: '🔒 {action}에 대한 권한이 취소되었습니다.',
      es: '🔒 Permiso revocado para {action}.',
      fr: '🔒 Permission révoquée pour {action}.',
      de: '🔒 Berechtigung entzogen für {action}.',
    },
  },
  {
    key: 'misc.task.assigned',
    translations: {
      id: '📌 Tugas ditugaskan ke {agent}: {task}',
      en: '📌 Task assigned to {agent}: {task}',
      zh: '📌 任务已分配给 {agent}：{task}',
      ja: '📌 タスクを{agent}に割り当てました: {task}',
      ko: '📌 작업이 {agent}에 할당됨: {task}',
      es: '📌 Tarea asignada a {agent}: {task}',
      fr: '📌 Tâche assignée à {agent} : {task}',
      de: '📌 Aufgabe zugewiesen an {agent}: {task}',
    },
  },
  {
    key: 'misc.task.completed',
    translations: {
      id: '✅ Tugas selesai: {task} ({duration}ms)',
      en: '✅ Task completed: {task} ({duration}ms)',
      zh: '✅ 任务完成：{task}（{duration}ms）',
      ja: '✅ タスク完了: {task} ({duration}ms)',
      ko: '✅ 작업 완료: {task} ({duration}ms)',
      es: '✅ Tarea completada: {task} ({duration}ms)',
      fr: '✅ Tâche terminée : {task} ({duration}ms)',
      de: '✅ Aufgabe abgeschlossen: {task} ({duration}ms)',
    },
  },
  {
    key: 'misc.cache.hit',
    translations: {
      id: '💎 Cache ditemukan: {key}',
      en: '💎 Cache hit: {key}',
      zh: '💎 缓存命中：{key}',
      ja: '💎 キャッシュヒット: {key}',
      ko: '💎 캐시 히트: {key}',
      es: '💎 Acierto de caché: {key}',
      fr: '💎 Entrée trouvée dans le cache : {key}',
      de: '💎 Cache-Treffer: {key}',
    },
  },
  {
    key: 'misc.cache.miss',
    translations: {
      id: '📭 Cache miss: {key}',
      en: '📭 Cache miss: {key}',
      zh: '📭 缓存未命中：{key}',
      ja: '📭 キャッシュミス: {key}',
      ko: '📭 캐시 미스: {key}',
      es: '📭 Fallo de caché: {key}',
      fr: '📭 Manque dans le cache : {key}',
      de: '📭 Cache-Miss: {key}',
    },
  },
  // ── More system messages ──
  {
    key: 'system.reload',
    translations: {
      id: 'Konfigurasi dimuat ulang.',
      en: 'Configuration reloaded.',
      zh: '配置已重新加载。',
      ja: '設定をリロードしました。',
      ko: '구성 다시 로드됨.',
      es: 'Configuración recargada.',
      fr: 'Configuration rechargée.',
      de: 'Konfiguration neu geladen.',
    },
  },
  {
    key: 'system.maintenance',
    translations: {
      id: '⚠️ Sistem dalam pemeliharaan.',
      en: '⚠️ System is under maintenance.',
      zh: '⚠️ 系统正在维护中。',
      ja: '⚠️ システムはメンテナンス中です。',
      ko: '⚠️ 시스템 점검 중입니다.',
      es: '⚠️ El sistema está en mantenimiento.',
      fr: '⚠️ Le système est en maintenance.',
      de: '⚠️ System ist in Wartung.',
    },
  },
  {
    key: 'system.update.complete',
    translations: {
      id: '🔄 Pembaruan selesai. Versi baru: {version}',
      en: '🔄 Update complete. New version: {version}',
      zh: '🔄 更新完成。新版本：{version}',
      ja: '🔄 更新完了。新しいバージョン: {version}',
      ko: '🔄 업데이트 완료. 새 버전: {version}',
      es: '🔄 Actualización completa. Nueva versión: {version}',
      fr: '🔄 Mise à jour terminée. Nouvelle version : {version}',
      de: '🔄 Update abgeschlossen. Neue Version: {version}',
    },
  },
  // ── More UI strings ──
  {
    key: 'confirm.yes',
    translations: {
      id: 'Ya',
      en: 'Yes',
      zh: '是',
      ja: 'はい',
      ko: '예',
      es: 'Sí',
      fr: 'Oui',
      de: 'Ja',
    },
  },
  {
    key: 'confirm.no',
    translations: {
      id: 'Tidak',
      en: 'No',
      zh: '否',
      ja: 'いいえ',
      ko: '아니오',
      es: 'No',
      fr: 'Non',
      de: 'Nein',
    },
  },
  {
    key: 'confirm.cancel',
    translations: {
      id: 'Batal',
      en: 'Cancel',
      zh: '取消',
      ja: 'キャンセル',
      ko: '취소',
      es: 'Cancelar',
      fr: 'Annuler',
      de: 'Abbrechen',
    },
  },
  {
    key: 'confirm.save',
    translations: {
      id: 'Simpan',
      en: 'Save',
      zh: '保存',
      ja: '保存',
      ko: '저장',
      es: 'Guardar',
      fr: 'Enregistrer',
      de: 'Speichern',
    },
  },
  {
    key: 'confirm.delete',
    translations: {
      id: 'Hapus',
      en: 'Delete',
      zh: '删除',
      ja: '削除',
      ko: '삭제',
      es: 'Eliminar',
      fr: 'Supprimer',
      de: 'Löschen',
    },
  },
  // ── More agent responses ──
  {
    key: 'response.thinking',
    translations: {
      id: '💭 Sedang berpikir...',
      en: '💭 Thinking...',
      zh: '💭 思考中...',
      ja: '💭 考え中...',
      ko: '💭 생각 중...',
      es: '💭 Pensando...',
      fr: '💭 Réflexion...',
      de: '💭 Nachdenken...',
    },
  },
  {
    key: 'response.waiting',
    translations: {
      id: '⏳ Menunggu hasil...',
      en: '⏳ Waiting for results...',
      zh: '⏳ 等待结果...',
      ja: '⏳ 結果を待っています...',
      ko: '⏳ 결과 대기 중...',
      es: '⏳ Esperando resultados...',
      fr: '⏳ En attente des résultats...',
      de: '⏳ Warte auf Ergebnisse...',
    },
  },
  {
    key: 'response.saving',
    translations: {
      id: '💾 Menyimpan...',
      en: '💾 Saving...',
      zh: '💾 保存中...',
      ja: '💾 保存中...',
      ko: '💾 저장 중...',
      es: '💾 Guardando...',
      fr: '💾 Enregistrement...',
      de: '💾 Speichern...',
    },
  },
  {
    key: 'response.uploading',
    translations: {
      id: '📤 Mengunggah...',
      en: '📤 Uploading...',
      zh: '📤 上传中...',
      ja: '📤 アップロード中...',
      ko: '📤 업로드 중...',
      es: '📤 Subiendo...',
      fr: '📤 Téléversement...',
      de: '📤 Hochladen...',
    },
  },
  {
    key: 'response.downloading',
    translations: {
      id: '📥 Mengunduh...',
      en: '📥 Downloading...',
      zh: '📥 下载中...',
      ja: '📥 ダウンロード中...',
      ko: '📥 다운로드 중...',
      es: '📥 Descargando...',
      fr: '📥 Téléchargement...',
      de: '📥 Herunterladen...',
    },
  },
  {
    key: 'response.loading',
    translations: {
      id: '🔄 Memuat...',
      en: '🔄 Loading...',
      zh: '🔄 加载中...',
      ja: '🔄 読み込み中...',
      ko: '🔄 로딩 중...',
      es: '🔄 Cargando...',
      fr: '🔄 Chargement...',
      de: '🔄 Laden...',
    },
  },
  // ── More error messages ──
  {
    key: 'error.already.exists',
    translations: {
      id: '{resource} sudah ada.',
      en: '{resource} already exists.',
      zh: '{resource} 已存在。',
      ja: '{resource}は既に存在します。',
      ko: '{resource}이(가) 이미 존재합니다.',
      es: '{resource} ya existe.',
      fr: '{resource} existe déjà.',
      de: '{resource} existiert bereits.',
    },
  },
  {
    key: 'error.locked',
    translations: {
      id: '{resource} terkunci. Coba lagi nanti.',
      en: '{resource} is locked. Try again later.',
      zh: '{resource} 已锁定。请稍后重试。',
      ja: '{resource}はロックされています。後でもう一度お試しください。',
      ko: '{resource}이(가) 잠겨 있습니다. 나중에 다시 시도하세요.',
      es: '{resource} está bloqueado. Inténtalo de nuevo más tarde.',
      fr: '{resource} est verrouillé. Réessayez plus tard.',
      de: '{resource} ist gesperrt. Versuchen Sie es später erneut.',
    },
  },
  {
    key: 'error.quota.exceeded',
    translations: {
      id: 'Kuota habis untuk {resource}.',
      en: 'Quota exceeded for {resource}.',
      zh: '{resource} 配额已用尽。',
      ja: '{resource}のクォータが上限に達しました。',
      ko: '{resource}의 할당량을 초과했습니다.',
      es: 'Cuota excedida para {resource}.',
      fr: 'Quota dépassé pour {resource}.',
      de: 'Kontingent für {resource} überschritten.',
    },
  },
  {
    key: 'error.network',
    translations: {
      id: 'Kesalahan jaringan. Periksa koneksi Anda.',
      en: 'Network error. Check your connection.',
      zh: '网络错误。请检查连接。',
      ja: 'ネットワークエラー。接続を確認してください。',
      ko: '네트워크 오류입니다. 연결을 확인하세요.',
      es: 'Error de red. Verifique su conexión.',
      fr: 'Erreur réseau. Vérifiez votre connexion.',
      de: 'Netzwerkfehler. Überprüfen Sie Ihre Verbindung.',
    },
  },
  {
    key: 'error.unsupported.format',
    translations: {
      id: 'Format tidak didukung: {format}',
      en: 'Unsupported format: {format}',
      zh: '不支持的格式：{format}',
      ja: 'サポートされていない形式: {format}',
      ko: '지원되지 않는 형식: {format}',
      es: 'Formato no soportado: {format}',
      fr: 'Format non supporté : {format}',
      de: 'Nicht unterstütztes Format: {format}',
    },
  },
  // ── More combo names ──
  {
    key: 'combo.name.code-review',
    translations: {
      id: 'Tinjauan Kode',
      en: 'Code Review',
      zh: '代码审查',
      ja: 'コードレビュー',
      ko: '코드 리뷰',
      es: 'Revisión de Código',
      fr: 'Revue de Code',
      de: 'Code-Review',
    },
  },
  {
    key: 'combo.name.data-analysis',
    translations: {
      id: 'Analisis Data',
      en: 'Data Analysis',
      zh: '数据分析',
      ja: 'データ分析',
      ko: '데이터 분석',
      es: 'Análisis de Datos',
      fr: 'Analyse de Données',
      de: 'Datenanalyse',
    },
  },
  // ── More misc ──
  {
    key: 'misc.copied',
    translations: {
      id: 'Tersalin!',
      en: 'Copied!',
      zh: '已复制！',
      ja: 'コピーしました！',
      ko: '복사됨!',
      es: '¡Copiado!',
      fr: 'Copié !',
      de: 'Kopiert!',
    },
  },
  {
    key: 'misc.processing',
    translations: {
      id: 'Memproses...',
      en: 'Processing...',
      zh: '处理中...',
      ja: '処理中...',
      ko: '처리 중...',
      es: 'Procesando...',
      fr: 'Traitement...',
      de: 'Verarbeitung...',
    },
  },
  {
    key: 'misc.saved',
    translations: {
      id: 'Tersimpan!',
      en: 'Saved!',
      zh: '已保存！',
      ja: '保存しました！',
      ko: '저장됨!',
      es: '¡Guardado!',
      fr: 'Enregistré !',
      de: 'Gespeichert!',
    },
  },
  {
    key: 'misc.deleted',
    translations: {
      id: 'Dihapus!',
      en: 'Deleted!',
      zh: '已删除！',
      ja: '削除しました！',
      ko: '삭제됨!',
      es: '¡Eliminado!',
      fr: 'Supprimé !',
      de: 'Gelöscht!',
    },
  },
];

// ─── I18nOutput Class ───────────────────────────────────────────────────────

export class I18nOutput {
  private config: I18nConfig;
  private currentLanguage: SupportedLanguage;
  private translations: Map<string, Record<SupportedLanguage, string>> =
    new Map();

  constructor(config?: Partial<I18nConfig>) {
    this.config = {
      defaultLanguage: 'id',
      fallbackLanguage: 'en',
      ...config,
    };
    this.currentLanguage = this.config.defaultLanguage;

    // Load built-in translations
    this.addTranslations(BUILTIN_TRANSLATIONS);
  }

  /**
   * Set the active output language.
   */
  setLanguage(lang: SupportedLanguage): void {
    if (!LANGUAGES.includes(lang)) {
      throw new Error(
        `Unsupported language: "${lang}". Supported: ${LANGUAGES.join(', ')}`,
      );
    }
    this.currentLanguage = lang;
  }

  /**
   * Get the active output language.
   */
  getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Look up a translation key in the active language with {var} interpolation.
   * Falls back to fallbackLanguage → returns key itself if neither found.
   */
  translate(key: string, vars?: Record<string, string>): string {
    const entry = this.translations.get(key);
    if (!entry) {
      // Key not registered at all — return raw key
      return this.applyVars(key, vars);
    }

    // Try current language first
    let text = entry[this.currentLanguage];
    if (!text || text === '') {
      // Fall back
      text = entry[this.config.fallbackLanguage];
    }
    if (!text || text === '') {
      // Last resort: return the key itself
      return key;
    }

    return this.applyVars(text, vars);
  }

  /**
   * Alias for translate().
   */
  t(key: string, vars?: Record<string, string>): string {
    return this.translate(key, vars);
  }

  /**
   * Register translation entries (add or update).
   */
  addTranslations(entries: TranslationEntry[]): void {
    for (const entry of entries) {
      this.translations.set(entry.key, { ...entry.translations });
    }
  }

  /**
   * Export all translations for a given language (or current if omitted).
   */
  getTranslations(lang?: SupportedLanguage): Record<string, string> {
    const targetLang = lang ?? this.currentLanguage;
    const result: Record<string, string> = {};
    this.translations.forEach((translations, key) => {
      result[key] = translations[targetLang] ?? key;
    });
    return result;
  }

  /**
   * Format/translate an arbitrary text string to the target language
   * using an LLM (hermes) via the local HTTP API.
   *
   * Falls back to returning the original text if the LLM call fails.
   */
  async formatResponse(
    text: string,
    sourceLang?: SupportedLanguage,
  ): Promise<string> {
    const targetLangName = LANGUAGE_NAMES[this.currentLanguage];

    // If source language matches target, no-op
    if (sourceLang && sourceLang === this.currentLanguage) {
      return text;
    }

    // Detect source if not provided
    const detected = sourceLang ?? this.detectLanguage(text);
    if (detected === this.currentLanguage) {
      return text;
    }

    const sourceLangName = LANGUAGE_NAMES[detected];

    const prompt = [
      `Translate the following text from ${sourceLangName} to ${targetLangName}.`,
      'Output ONLY the translated text, no explanations.',
      '',
      text,
    ].join('\n');

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'hermes',
          prompt,
          stream: false,
          options: { temperature: 0.3 },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      const translated = data.response?.trim();

      if (!translated) {
        return text;
      }

      return translated;
    } catch {
      // LLM unavailable — return original text
      return text;
    }
  }

  /**
   * Simple heuristic language detection based on character ranges
   * and common word patterns.
   */
  detectLanguage(text: string): SupportedLanguage {
    if (!text || text.trim().length === 0) {
      return this.config.fallbackLanguage;
    }

    const sample = text.slice(0, 2000);

    // ── CJK character detection ──
    const cjk = (pattern: RegExp): number => {
      const matches = sample.match(pattern);
      return matches ? matches.length : 0;
    };

    const hanzi = cjk(/[\u4e00-\u9fff]/g);      // Chinese Hanzi
    const hiragana = cjk(/[\u3040-\u309f]/g);    // Japanese Hiragana
    const katakana = cjk(/[\u30a0-\u30ff]/g);    // Japanese Katakana
    const hangul = cjk(/[\uac00-\ud7af]/g);      // Korean Hangul
    const latin = cjk(/[a-zA-Z]/g);

    // Korean: dominant Hangul
    if (hangul > 20 && hangul > latin) {
      return 'ko';
    }

    // Japanese: significant Hiragana or Katakana presence
    if (hiragana > 10 || katakana > 10) {
      return 'ja';
    }

    // Chinese: dominant Hanzi, no significant Japanese kana
    if (hanzi > 20 && hiragana < 5 && katakana < 5) {
      return 'zh';
    }

    // ── Latin-script heuristics ──
    const lower = sample.toLowerCase();

    // Indonesian markers
    const idMarkers = [
      'selamat',
      'datang',
      'terima',
      'kasih',
      'dengan',
      'adalah',
      'untuk',
      'yang',
      'ini',
      'itu',
      'dan',
      'atau',
      'tidak',
      'ada',
      'bisa',
      'akan',
      'saya',
      'kami',
      'mereka',
      'bagaimana',
      'mengapa',
      'kapan',
      'dimana',
      'siapa',
    ];
    const idScore = idMarkers.filter((m) => lower.includes(m)).length;

    // German markers
    const deMarkers = [
      'der',
      'die',
      'das',
      'ist',
      'und',
      'nicht',
      'ein',
      'eine',
      'ich',
      'sie',
      'wir',
      'haben',
      'können',
      'müssen',
      'werden',
      'sich',
      'auf',
      'für',
      'mit',
      'über',
      'auch',
      'noch',
    ];
    const deScore = deMarkers.filter((m) => lower.includes(m)).length;

    // French markers
    const frMarkers = [
      'le',
      'la',
      'les',
      'des',
      'est',
      'une',
      'que',
      'pour',
      'dans',
      'avec',
      'nous',
      'vous',
      'ils',
      'elle',
      'sont',
      'être',
      'avoir',
      'fait',
      'pas',
      'plus',
      'très',
      'tout',
      'aussi',
      'comme',
    ];
    const frScore = frMarkers.filter((m) => lower.includes(m)).length;

    // Spanish markers
    const esMarkers = [
      'el',
      'la',
      'los',
      'las',
      'es',
      'un',
      'una',
      'que',
      'por',
      'con',
      'para',
      'como',
      'pero',
      'más',
      'del',
      'del',
      'está',
      'tiene',
      'hacer',
      'todo',
      'también',
      'puede',
      'sobre',
    ];
    const esScore = esMarkers.filter((m) => lower.includes(m)).length;

    // English: fallback for Latin-script text
    // Pick the highest scoring language; if no strong signal, default to English
    const scores: [SupportedLanguage, number][] = [
      ['id', idScore],
      ['de', deScore],
      ['fr', frScore],
      ['es', esScore],
    ];

    scores.sort((a, b) => b[1] - a[1]);

    if (scores[0][1] >= 3) {
      return scores[0][0];
    }

    return 'en';
  }

  // ── Private helpers ──

  /**
   * Replace {var} placeholders in a template string.
   */
  private applyVars(
    text: string,
    vars?: Record<string, string>,
  ): string {
    if (!vars) return text;

    return text.replace(/\{(\w+)\}/g, (match, varName) => {
      return vars[varName] !== undefined ? vars[varName] : match;
    });
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * Quick factory — creates an I18nOutput with the given default language.
 */
export function createI18n(lang: SupportedLanguage = 'id'): I18nOutput {
  return new I18nOutput({
    defaultLanguage: lang,
    fallbackLanguage: 'en',
  });
}
