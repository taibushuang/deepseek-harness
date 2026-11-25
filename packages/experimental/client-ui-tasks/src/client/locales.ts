/** Task panel copy. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'
/** Locale namespace for the task panel. */
export const NS = 'tasks'

const zh = {
  'type.label': '任务',
  'guide.description': '按到期时间查看、添加和完成个人待办。',
  'add.placeholder': '添加任务…',
  'add.button': '添加',
  'group.overdue': '逾期',
  'group.today': '今天',
  'group.week': '本周',
  'group.later': '以后',
  'group.done': '已完成',
  'row.complete': '完成任务',
  'row.reopen': '重新打开',
  'row.remove': '删除任务',
  'row.due': '到期 {date}',
  'row.tags': '标签：{tags}',
  'empty': '还没有任务。',
  'loading': '正在读取任务…',
  'error': '任务读取失败：{message}',
  'retry': '重试',
  'add.failed': '添加失败：{message}',
  'update.failed': '更新失败：{message}',
  'remove.failed': '删除失败：{message}',
  'row.files': '{count} 个文件',
  'count': '{count} 项',
} as const

/** Locale keys for the task panel. */
export type TasksKey = keyof typeof zh

const en: Record<TasksKey, string> = {
  'type.label': 'Tasks', 'guide.description': 'Review, add, and complete personal tasks by due date.',
  'add.placeholder': 'Add a task…', 'add.button': 'Add',
  'group.overdue': 'Overdue', 'group.today': 'Today', 'group.week': 'This week', 'group.later': 'Later', 'group.done': 'Done',
  'row.complete': 'Complete task', 'row.reopen': 'Reopen task', 'row.remove': 'Remove task',
  'row.due': 'Due {date}', 'row.tags': 'Tags: {tags}', 'empty': 'No tasks yet.', 'loading': 'Loading tasks…',
  'error': 'Could not load tasks: {message}', 'retry': 'Retry', 'add.failed': 'Could not add: {message}',
  'update.failed': 'Could not update: {message}', 'remove.failed': 'Could not remove: {message}', 'row.files': '{count} files', 'count': '{count} items',
}

const ja: Record<TasksKey, string> = {
  'type.label': 'タスク', 'guide.description': '個人タスクを期限順に確認・追加・完了します。',
  'add.placeholder': 'タスクを追加…', 'add.button': '追加',
  'group.overdue': '期限切れ', 'group.today': '今日', 'group.week': '今週', 'group.later': '今後', 'group.done': '完了',
  'row.complete': 'タスクを完了', 'row.reopen': 'タスクを再開', 'row.remove': 'タスクを削除',
  'row.due': '期限 {date}', 'row.tags': 'タグ：{tags}', 'empty': 'タスクはまだありません。', 'loading': 'タスクを読み込み中…',
  'error': 'タスクを読み込めません：{message}', 'retry': '再試行', 'add.failed': '追加できません：{message}',
  'update.failed': '更新できません：{message}', 'remove.failed': '削除できません：{message}', 'row.files': '{count} ファイル', 'count': '{count} 件',
}

const es: Record<TasksKey, string> = {
  'type.label': 'Tareas', 'guide.description': 'Revisa, añade y completa tareas personales por fecha de vencimiento.',
  'add.placeholder': 'Añadir una tarea…', 'add.button': 'Añadir',
  'group.overdue': 'Vencidas', 'group.today': 'Hoy', 'group.week': 'Esta semana', 'group.later': 'Más tarde', 'group.done': 'Hechas',
  'row.complete': 'Completar tarea', 'row.reopen': 'Reabrir tarea', 'row.remove': 'Eliminar tarea',
  'row.due': 'Vence {date}', 'row.tags': 'Etiquetas: {tags}', 'empty': 'Aún no hay tareas.', 'loading': 'Cargando tareas…',
  'error': 'No se pudieron cargar: {message}', 'retry': 'Reintentar', 'add.failed': 'No se pudo añadir: {message}',
  'update.failed': 'No se pudo actualizar: {message}', 'remove.failed': 'No se pudo eliminar: {message}', 'row.files': '{count} archivos', 'count': '{count} elementos',
}

const fr: Record<TasksKey, string> = {
  'type.label': 'Tâches', 'guide.description': 'Consultez, ajoutez et terminez vos tâches personnelles par échéance.',
  'add.placeholder': 'Ajouter une tâche…', 'add.button': 'Ajouter',
  'group.overdue': 'En retard', 'group.today': 'Aujourd’hui', 'group.week': 'Cette semaine', 'group.later': 'Plus tard', 'group.done': 'Terminées',
  'row.complete': 'Terminer la tâche', 'row.reopen': 'Rouvrir la tâche', 'row.remove': 'Supprimer la tâche',
  'row.due': 'Échéance {date}', 'row.tags': 'Étiquettes : {tags}', 'empty': 'Aucune tâche pour le moment.', 'loading': 'Chargement des tâches…',
  'error': 'Impossible de charger : {message}', 'retry': 'Réessayer', 'add.failed': 'Ajout impossible : {message}',
  'update.failed': 'Mise à jour impossible : {message}', 'remove.failed': 'Suppression impossible : {message}', 'row.files': '{count} fichiers', 'count': '{count} éléments',
}

const de: Record<TasksKey, string> = {
  'type.label': 'Aufgaben', 'guide.description': 'Persönliche Aufgaben nach Fälligkeit prüfen, hinzufügen und abschließen.',
  'add.placeholder': 'Aufgabe hinzufügen…', 'add.button': 'Hinzufügen',
  'group.overdue': 'Überfällig', 'group.today': 'Heute', 'group.week': 'Diese Woche', 'group.later': 'Später', 'group.done': 'Erledigt',
  'row.complete': 'Aufgabe abschließen', 'row.reopen': 'Aufgabe wieder öffnen', 'row.remove': 'Aufgabe löschen',
  'row.due': 'Fällig {date}', 'row.tags': 'Tags: {tags}', 'empty': 'Noch keine Aufgaben.', 'loading': 'Aufgaben werden geladen…',
  'error': 'Aufgaben konnten nicht geladen werden: {message}', 'retry': 'Erneut versuchen', 'add.failed': 'Hinzufügen fehlgeschlagen: {message}',
  'update.failed': 'Aktualisieren fehlgeschlagen: {message}', 'remove.failed': 'Löschen fehlgeschlagen: {message}', 'row.files': '{count} Dateien', 'count': '{count} Einträge',
}

const ru: Record<TasksKey, string> = {
  'type.label': 'Задачи', 'guide.description': 'Просматривайте, добавляйте и завершайте личные задачи по сроку.',
  'add.placeholder': 'Добавить задачу…', 'add.button': 'Добавить',
  'group.overdue': 'Просрочено', 'group.today': 'Сегодня', 'group.week': 'На этой неделе', 'group.later': 'Позже', 'group.done': 'Выполнено',
  'row.complete': 'Завершить задачу', 'row.reopen': 'Открыть заново', 'row.remove': 'Удалить задачу',
  'row.due': 'Срок {date}', 'row.tags': 'Теги: {tags}', 'empty': 'Задач пока нет.', 'loading': 'Загрузка задач…',
  'error': 'Не удалось загрузить задачи: {message}', 'retry': 'Повторить', 'add.failed': 'Не удалось добавить: {message}',
  'update.failed': 'Не удалось обновить: {message}', 'remove.failed': 'Не удалось удалить: {message}', 'row.files': 'Файлов: {count}', 'count': '{count} элементов',
}

const pt: Record<TasksKey, string> = {
  'type.label': 'Tarefas', 'guide.description': 'Veja, adicione e conclua tarefas pessoais por vencimento.',
  'add.placeholder': 'Adicionar tarefa…', 'add.button': 'Adicionar',
  'group.overdue': 'Atrasadas', 'group.today': 'Hoje', 'group.week': 'Esta semana', 'group.later': 'Depois', 'group.done': 'Concluídas',
  'row.complete': 'Concluir tarefa', 'row.reopen': 'Reabrir tarefa', 'row.remove': 'Remover tarefa',
  'row.due': 'Vence {date}', 'row.tags': 'Tags: {tags}', 'empty': 'Ainda não há tarefas.', 'loading': 'Carregando tarefas…',
  'error': 'Não foi possível carregar: {message}', 'retry': 'Tentar novamente', 'add.failed': 'Não foi possível adicionar: {message}',
  'update.failed': 'Não foi possível atualizar: {message}', 'remove.failed': 'Não foi possível remover: {message}', 'row.files': '{count} arquivos', 'count': '{count} itens',
}
/** Eight-language dictionaries registered under the `tasks` namespace. */
export const dictionaries = { zh, en, ja, es, fr, de, ru, pt } as const
