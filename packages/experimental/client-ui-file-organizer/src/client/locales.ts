/** File-organizer card copy. */
export const NS = 'fileOrganizer'

const zh = {
  heading: '文件整理',
  apply: '执行',
  undo: '撤销',
  dismiss: '取消',
  working: '处理中…',
  applied: '已执行',
  partial: '部分执行',
  undone: '已撤销',
  undoPartial: '部分撤销',
  failed: '执行失败',
  alreadyApplied: '该批次已执行',
  notApplied: '该批次尚未执行',
  scope: '仅移动预览中的文件；目标已存在时不会覆盖。',
  summary: '{moves} 个文件 → {directory}',
  skipped: '跳过 {count} 项',
  transport: '网络中断，请重试。',
  unknown: '该卡片不可用。',
  notLiveRoot: '只能在当前会话中操作。',
  accessDenied: '没有执行权限。',
  readOnly: '当前会话不可写。',
  closing: '插件正在卸载。',
  unavailable: '该整理批次已不可用。',
} as const

/** Locale keys for the file-organizer card body. */
export type FileOrganizerKey = keyof typeof zh

const en: Record<FileOrganizerKey, string> = {
  heading: 'File organization', apply: 'Apply', undo: 'Undo', dismiss: 'Cancel', working: 'Working…',
  applied: 'Applied', partial: 'Partially applied', undone: 'Undone', undoPartial: 'Partially undone',
  failed: 'Failed', alreadyApplied: 'This batch is already applied', notApplied: 'This batch has not been applied',
  scope: 'Only the previewed files move; existing destinations are never overwritten.',
  summary: '{moves} files → {directory}', skipped: '{count} skipped', transport: 'Connection lost. Try again.',
  unknown: 'This card is unavailable.', notLiveRoot: 'Act on this card in its own conversation.',
  accessDenied: 'You do not have permission to do this.', readOnly: 'This conversation is read-only.',
  closing: 'The plugin is unloading.', unavailable: 'This organization batch is no longer available.',
}

const ja: Record<FileOrganizerKey, string> = {
  heading: 'ファイル整理', apply: '実行', undo: '元に戻す', dismiss: 'キャンセル', working: '処理中…',
  applied: '実行済み', partial: '一部実行', undone: '元に戻しました', undoPartial: '一部元に戻しました',
  failed: '実行に失敗しました', alreadyApplied: 'このバッチは実行済みです', notApplied: 'このバッチはまだ実行されていません',
  scope: 'プレビューしたファイルのみ移動します。既存の移動先は上書きしません。',
  summary: '{moves} ファイル → {directory}', skipped: '{count} 件スキップ', transport: '接続が切れました。再試行してください。',
  unknown: 'このカードは利用できません。', notLiveRoot: 'このカードは元の会話で操作してください。',
  accessDenied: '実行権限がありません。', readOnly: 'この会話は読み取り専用です。',
  closing: 'プラグインをアンロードしています。', unavailable: 'この整理バッチは利用できません。',
}

const es: Record<FileOrganizerKey, string> = {
  heading: 'Organización de archivos', apply: 'Ejecutar', undo: 'Deshacer', dismiss: 'Cancelar', working: 'Procesando…',
  applied: 'Ejecutado', partial: 'Ejecutado parcialmente', undone: 'Deshecho', undoPartial: 'Deshecho parcialmente',
  failed: 'Error al ejecutar', alreadyApplied: 'Este lote ya se ejecutó', notApplied: 'Este lote aún no se ha ejecutado',
  scope: 'Solo se mueven los archivos de la vista previa; nunca se sobrescribe un destino existente.',
  summary: '{moves} archivos → {directory}', skipped: '{count} omitidos', transport: 'Se perdió la conexión. Inténtalo de nuevo.',
  unknown: 'Esta tarjeta no está disponible.', notLiveRoot: 'Actúa sobre esta tarjeta en su propia conversación.',
  accessDenied: 'No tienes permiso para hacer esto.', readOnly: 'Esta conversación es de solo lectura.',
  closing: 'El plugin se está descargando.', unavailable: 'Este lote de organización ya no está disponible.',
}

const fr: Record<FileOrganizerKey, string> = {
  heading: 'Organisation de fichiers', apply: 'Exécuter', undo: 'Annuler', dismiss: 'Fermer', working: 'Traitement…',
  applied: 'Exécuté', partial: 'Partiellement exécuté', undone: 'Annulé', undoPartial: 'Partiellement annulé',
  failed: 'Échec de l’exécution', alreadyApplied: 'Ce lot est déjà exécuté', notApplied: 'Ce lot n’a pas encore été exécuté',
  scope: 'Seuls les fichiers de l’aperçu sont déplacés ; aucune destination existante n’est écrasée.',
  summary: '{moves} fichiers → {directory}', skipped: '{count} ignorés', transport: 'Connexion perdue. Réessayez.',
  unknown: 'Cette carte est indisponible.', notLiveRoot: 'Agissez sur cette carte dans sa propre conversation.',
  accessDenied: 'Vous n’avez pas l’autorisation.', readOnly: 'Cette conversation est en lecture seule.',
  closing: 'Le plugin se décharge.', unavailable: 'Ce lot d’organisation n’est plus disponible.',
}

const de: Record<FileOrganizerKey, string> = {
  heading: 'Dateiorganisation', apply: 'Ausführen', undo: 'Rückgängig', dismiss: 'Abbrechen', working: 'Wird verarbeitet…',
  applied: 'Ausgeführt', partial: 'Teilweise ausgeführt', undone: 'Rückgängig gemacht', undoPartial: 'Teilweise rückgängig',
  failed: 'Ausführung fehlgeschlagen', alreadyApplied: 'Dieser Stapel ist bereits ausgeführt', notApplied: 'Dieser Stapel wurde noch nicht ausgeführt',
  scope: 'Nur die Vorschaudateien werden verschoben; vorhandene Ziele werden nie überschrieben.',
  summary: '{moves} Dateien → {directory}', skipped: '{count} übersprungen', transport: 'Verbindung verloren. Erneut versuchen.',
  unknown: 'Diese Karte ist nicht verfügbar.', notLiveRoot: 'Bearbeite diese Karte in ihrem eigenen Gespräch.',
  accessDenied: 'Dafür fehlt die Berechtigung.', readOnly: 'Dieses Gespräch ist schreibgeschützt.',
  closing: 'Das Plugin wird entladen.', unavailable: 'Dieser Organisationsstapel ist nicht mehr verfügbar.',
}

const ru: Record<FileOrganizerKey, string> = {
  heading: 'Организация файлов', apply: 'Выполнить', undo: 'Отменить', dismiss: 'Закрыть', working: 'Обработка…',
  applied: 'Выполнено', partial: 'Выполнено частично', undone: 'Отменено', undoPartial: 'Отменено частично',
  failed: 'Ошибка выполнения', alreadyApplied: 'Этот пакет уже выполнен', notApplied: 'Этот пакет ещё не выполнен',
  scope: 'Перемещаются только файлы из предпросмотра; существующие папки не перезаписываются.',
  summary: '{moves} файлов → {directory}', skipped: 'Пропущено: {count}', transport: 'Соединение потеряно. Повторите попытку.',
  unknown: 'Эта карточка недоступна.', notLiveRoot: 'Действуйте с карточкой в её собственном разговоре.',
  accessDenied: 'Недостаточно прав.', readOnly: 'Этот разговор доступен только для чтения.',
  closing: 'Плагин выгружается.', unavailable: 'Этот пакет организации больше недоступен.',
}

const pt: Record<FileOrganizerKey, string> = {
  heading: 'Organização de arquivos', apply: 'Executar', undo: 'Desfazer', dismiss: 'Cancelar', working: 'Processando…',
  applied: 'Executado', partial: 'Executado parcialmente', undone: 'Desfeito', undoPartial: 'Desfeito parcialmente',
  failed: 'Falha ao executar', alreadyApplied: 'Este lote já foi executado', notApplied: 'Este lote ainda não foi executado',
  scope: 'Apenas os arquivos da prévia são movidos; destinos existentes nunca são sobrescritos.',
  summary: '{moves} arquivos → {directory}', skipped: '{count} ignorados', transport: 'Conexão perdida. Tente novamente.',
  unknown: 'Este cartão não está disponível.', notLiveRoot: 'Aja neste cartão na conversa dele.',
  accessDenied: 'Você não tem permissão.', readOnly: 'Esta conversa é somente leitura.',
  closing: 'O plugin está sendo descarregado.', unavailable: 'Este lote de organização não está mais disponível.',
}

/** Eight-language dictionaries registered under the `fileOrganizer` namespace. */
export const dictionaries = { zh, en, ja, es, fr, de, ru, pt } as const
