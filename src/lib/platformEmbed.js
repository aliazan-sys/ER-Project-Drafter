export function conversationIdFromParams(params) {
  return (
    String(params.get('conversation') || '').trim() ||
    String(params.get('conversation_id') || '').trim()
  )
}

export function suggestionsFromMessages(messages) {
  if (!Array.isArray(messages)) return []

  const latestAssistantMessage = [...messages].reverse().find((message) => message?.role === 'bot')
  if (!Array.isArray(latestAssistantMessage?.suggestions)) return []

  return [...new Set(
    latestAssistantMessage.suggestions
      .filter((suggestion) => typeof suggestion === 'string')
      .map((suggestion) => suggestion.trim())
      .filter(Boolean),
  )].slice(0, 4)
}
