export function conversationIdFromParams(params) {
  return (
    String(params.get('conversation') || '').trim() ||
    String(params.get('conversation_id') || '').trim()
  )
}
