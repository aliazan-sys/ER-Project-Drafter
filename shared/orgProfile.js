// Organization-profile pick-lists, shared by the client (the Review step's
// Type/Size dropdowns) and the server (so the AI matches these exact values).
// Type and Size are fixed lists; Industry is free text; Location is a
// geographic address, autocompleted from Google Places (see shared/places.js).
export const ORG_TYPES = [
  'Startup',
  'Small-Medium Enterprise (SME)',
  'Enterprise',
  'Solo Business',
  'NGO',
  'INGO & Government',
]

export const ORG_SIZES = [
  'Less than 10 employees',
  'Small, 10-20 employees',
  'Medium 20-50 employees',
  'Large +50 employees',
]
