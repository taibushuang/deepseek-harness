/** Locale-owned copy for the right Sidebar tag panel. */

/** Dictionary namespace for this plugin. */
export const NS = 'filetags'

/** English copy and key source. */
export const en = {
  'type.label': 'Tags',
  'tags.filterPlaceholder': 'Filter tags',
  'expression.label': 'Tag expression',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'That tag expression is not valid.',
  'expression.hint': 'Combine tag names with and, or, not, and parentheses.',
  'empty.noTags': 'No tags yet. Ask the model to tag a file or folder.',
  'empty.noSelection': 'Select a tag or enter an expression.',
  'empty.noResults': 'No tagged paths match.',
  'results.filterPlaceholder': 'Filter paths',
  'results.count': '{count} results',
  'loading': 'Loading tags…',
  'error.load': 'The tags could not be read.',
  'error.write': 'The tag change failed.',
  'error.tagName': 'Use one word per tag without spaces or parentheses.',
  'row.addPlaceholder': 'Add a tag',
  'row.add': 'Add',
  'row.remove': 'Remove {tag}',
  'row.dir': 'Folder',
  'row.file': 'File',
} satisfies Record<string, string>

/** Chinese dictionary, checked against the English keys. */
export const zh = {
  'type.label': '标签',
  'tags.filterPlaceholder': '过滤标签',
  'expression.label': '标签表达式',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': '该标签表达式无效。',
  'expression.hint': '用 and、or、not 和括号组合标签名。',
  'empty.noTags': '还没有标签。让模型给文件或文件夹打标签。',
  'empty.noSelection': '选择一个标签或输入表达式。',
  'empty.noResults': '没有匹配的已标记路径。',
  'results.filterPlaceholder': '过滤路径',
  'results.count': '{count} 个结果',
  'loading': '正在加载标签…',
  'error.load': '无法读取标签。',
  'error.write': '标签修改失败。',
  'error.tagName': '每个标签只能是一个词，不能包含空格或括号。',
  'row.addPlaceholder': '添加标签',
  'row.add': '添加',
  'row.remove': '移除 {tag}',
  'row.dir': '文件夹',
  'row.file': '文件',
} satisfies Record<keyof typeof en, string>

/** Japanese dictionary, checked against the English keys. */
export const ja = {
  'type.label': 'タグ',
  'tags.filterPlaceholder': 'タグを絞り込む',
  'expression.label': 'タグ式',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'このタグ式は無効です。',
  'expression.hint': 'タグ名を and、or、not、括弧で組み合わせます。',
  'empty.noTags': 'タグはまだありません。モデルにファイルやフォルダーのタグ付けを依頼してください。',
  'empty.noSelection': 'タグを選ぶか式を入力してください。',
  'empty.noResults': '一致するタグ付きパスはありません。',
  'results.filterPlaceholder': 'パスを絞り込む',
  'results.count': '{count} 件',
  'loading': 'タグを読み込み中…',
  'error.load': 'タグを読み取れませんでした。',
  'error.write': 'タグを変更できませんでした。',
  'error.tagName': 'タグは空白や括弧を含まない 1 語にしてください。',
  'row.addPlaceholder': 'タグを追加',
  'row.add': '追加',
  'row.remove': '{tag} を削除',
  'row.dir': 'フォルダー',
  'row.file': 'ファイル',
} satisfies Record<keyof typeof en, string>

/** Spanish dictionary, checked against the English keys. */
export const es = {
  'type.label': 'Etiquetas',
  'tags.filterPlaceholder': 'Filtrar etiquetas',
  'expression.label': 'Expresión de etiquetas',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'Esta expresión de etiquetas no es válida.',
  'expression.hint': 'Combina nombres de etiqueta con and, or, not y paréntesis.',
  'empty.noTags': 'Aún no hay etiquetas. Pide al modelo que etiquete un archivo o una carpeta.',
  'empty.noSelection': 'Selecciona una etiqueta o escribe una expresión.',
  'empty.noResults': 'Ninguna ruta etiquetada coincide.',
  'results.filterPlaceholder': 'Filtrar rutas',
  'results.count': '{count} resultados',
  'loading': 'Cargando etiquetas…',
  'error.load': 'No se pudieron leer las etiquetas.',
  'error.write': 'No se pudo cambiar la etiqueta.',
  'error.tagName': 'Usa una sola palabra por etiqueta, sin espacios ni paréntesis.',
  'row.addPlaceholder': 'Añadir una etiqueta',
  'row.add': 'Añadir',
  'row.remove': 'Quitar {tag}',
  'row.dir': 'Carpeta',
  'row.file': 'Archivo',
} satisfies Record<keyof typeof en, string>

/** French dictionary, checked against the English keys. */
export const fr = {
  'type.label': 'Étiquettes',
  'tags.filterPlaceholder': 'Filtrer les étiquettes',
  'expression.label': 'Expression d’étiquettes',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'Cette expression d’étiquettes n’est pas valide.',
  'expression.hint': 'Combinez les noms d’étiquette avec and, or, not et des parenthèses.',
  'empty.noTags': 'Aucune étiquette pour l’instant. Demandez au modèle d’étiqueter un fichier ou un dossier.',
  'empty.noSelection': 'Sélectionnez une étiquette ou saisissez une expression.',
  'empty.noResults': 'Aucun chemin étiqueté ne correspond.',
  'results.filterPlaceholder': 'Filtrer les chemins',
  'results.count': '{count} résultats',
  'loading': 'Chargement des étiquettes…',
  'error.load': 'Les étiquettes n’ont pas pu être lues.',
  'error.write': 'La modification de l’étiquette a échoué.',
  'error.tagName': 'Utilisez un seul mot par étiquette, sans espaces ni parenthèses.',
  'row.addPlaceholder': 'Ajouter une étiquette',
  'row.add': 'Ajouter',
  'row.remove': 'Retirer {tag}',
  'row.dir': 'Dossier',
  'row.file': 'Fichier',
} satisfies Record<keyof typeof en, string>

/** German dictionary, checked against the English keys. */
export const de = {
  'type.label': 'Tags',
  'tags.filterPlaceholder': 'Tags filtern',
  'expression.label': 'Tag-Ausdruck',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'Dieser Tag-Ausdruck ist ungültig.',
  'expression.hint': 'Kombiniere Tag-Namen mit and, or, not und Klammern.',
  'empty.noTags': 'Noch keine Tags. Bitte das Modell, eine Datei oder einen Ordner zu taggen.',
  'empty.noSelection': 'Wähle ein Tag oder gib einen Ausdruck ein.',
  'empty.noResults': 'Keine getaggten Pfade passen.',
  'results.filterPlaceholder': 'Pfade filtern',
  'results.count': '{count} Ergebnisse',
  'loading': 'Tags werden geladen…',
  'error.load': 'Die Tags konnten nicht gelesen werden.',
  'error.write': 'Die Tag-Änderung ist fehlgeschlagen.',
  'error.tagName': 'Verwende ein Wort pro Tag, ohne Leerzeichen oder Klammern.',
  'row.addPlaceholder': 'Tag hinzufügen',
  'row.add': 'Hinzufügen',
  'row.remove': '{tag} entfernen',
  'row.dir': 'Ordner',
  'row.file': 'Datei',
} satisfies Record<keyof typeof en, string>

/** Russian dictionary, checked against the English keys. */
export const ru = {
  'type.label': 'Теги',
  'tags.filterPlaceholder': 'Фильтр тегов',
  'expression.label': 'Выражение тегов',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'Это выражение тегов недопустимо.',
  'expression.hint': 'Объединяйте имена тегов с помощью and, or, not и скобок.',
  'empty.noTags': 'Тегов пока нет. Попросите модель пометить файл или папку.',
  'empty.noSelection': 'Выберите тег или введите выражение.',
  'empty.noResults': 'Нет помеченных путей, соответствующих запросу.',
  'results.filterPlaceholder': 'Фильтр путей',
  'results.count': 'Результатов: {count}',
  'loading': 'Загрузка тегов…',
  'error.load': 'Не удалось прочитать теги.',
  'error.write': 'Не удалось изменить тег.',
  'error.tagName': 'Используйте одно слово на тег, без пробелов и скобок.',
  'row.addPlaceholder': 'Добавить тег',
  'row.add': 'Добавить',
  'row.remove': 'Удалить {tag}',
  'row.dir': 'Папка',
  'row.file': 'Файл',
} satisfies Record<keyof typeof en, string>

/** Portuguese dictionary, checked against the English keys. */
export const pt = {
  'type.label': 'Etiquetas',
  'tags.filterPlaceholder': 'Filtrar etiquetas',
  'expression.label': 'Expressão de etiquetas',
  'expression.placeholder': 'project and not archive',
  'expression.invalid': 'Esta expressão de etiquetas não é válida.',
  'expression.hint': 'Combine nomes de etiqueta com and, or, not e parênteses.',
  'empty.noTags': 'Ainda não há etiquetas. Peça ao modelo para etiquetar um arquivo ou uma pasta.',
  'empty.noSelection': 'Selecione uma etiqueta ou insira uma expressão.',
  'empty.noResults': 'Nenhum caminho etiquetado corresponde.',
  'results.filterPlaceholder': 'Filtrar caminhos',
  'results.count': '{count} resultados',
  'loading': 'Carregando etiquetas…',
  'error.load': 'Não foi possível ler as etiquetas.',
  'error.write': 'Não foi possível alterar a etiqueta.',
  'error.tagName': 'Use uma palavra por etiqueta, sem espaços ou parênteses.',
  'row.addPlaceholder': 'Adicionar uma etiqueta',
  'row.add': 'Adicionar',
  'row.remove': 'Remover {tag}',
  'row.dir': 'Pasta',
  'row.file': 'Arquivo',
} satisfies Record<keyof typeof en, string>

/** Dictionary keys this namespace declares. */
export type FiletagsKey = keyof typeof en
