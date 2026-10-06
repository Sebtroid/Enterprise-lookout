READ_PATHS = {
    "workspace": "/rest/lookout/workspace",
    "contacts": "/rest/lookout/contacts",
    "profile": "/rest/lookout/profile",
    "usage": "/rest/lookout/usage",
    "runtime": "/rest/lookout/runtime",
}
ALLOWED_ACTIONS = {
    "createWork", "updateWork", "createEvent", "updateEvent", "linkCompany",
    "updateSponsorship", "saveContribution", "saveBudget", "saveBenefit",
    "saveDraft", "saveProfile",
}
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
MAX_COMMAND_BYTES = 64 * 1024
REQUEST_TIMEOUT_SECONDS = 30
