const API_BASE = '/api/v1';

function getToken() {
  return localStorage.getItem('tapmi_token');
}

export function setToken(token) {
  if (token) {
    localStorage.setItem('tapmi_token', token);
  } else {
    localStorage.removeItem('tapmi_token');
  }
}

async function getAuthorizedResponse(endpoint) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { headers });
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    throw new Error(data?.error?.message || 'File download failed');
  }

  return response;
}

async function downloadFile(endpoint) {
  const response = await getAuthorizedResponse(endpoint);
  const blob = await response.blob();

  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const filename = decodeURIComponent(filenameMatch?.[1] || filenameMatch?.[2] || 'department-roster');
  return { blob, filename };
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.error?.message || data?.warning?.message || 'Server request failed';
    const errorObj = new Error(errorMsg);
    errorObj.status = response.status;
    errorObj.data = data;
    throw errorObj;
  }

  return data;
}

export const api = {
  // Auth
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  requestActivation: (payload) => request('/auth/activation/request', { method: 'POST', body: payload }),
  verifyActivation: (payload) => request('/auth/activation/verify', { method: 'POST', body: payload }),
  completeActivation: (payload) => request('/auth/activation/complete', { method: 'POST', body: payload }),
  getMe: () => request('/me'),

  // Volunteers
  getVolunteers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/volunteers${q ? `?${q}` : ''}`);
  },
  getVolunteer: (id) => request(`/volunteers/${id}`),
  createVolunteer: (payload) => request('/volunteers', { method: 'POST', body: payload }),
  updateVolunteer: (id, payload) => request(`/volunteers/${id}`, { method: 'PATCH', body: payload }),
  getMySkills: () => request('/me/skills'),
  updateMySkills: (skill_ids) => request('/me/skills', { method: 'PUT', body: { skill_ids } }),
  getMyAssignments: () => request('/me/assignments'),
  getMyAssignmentHistory: () => request('/me/assignment-history'),

  // Skills
  getSkills: () => request('/skills'),
  suggestSkill: (payload) => request('/skills/suggestions', { method: 'POST', body: payload }),
  getSuggestions: () => request('/skills/suggestions'),
  approveSuggestion: (id) => request(`/skills/suggestions/${id}/approve`, { method: 'POST' }),
  rejectSuggestion: (id, reason) => request(`/skills/suggestions/${id}/reject`, { method: 'POST', body: { reason } }),

  // Events & Requirements
  getEvents: () => request('/events'),
  getEvent: (id) => request(`/events/${id}`),
  createEvent: (payload) => request('/events', { method: 'POST', body: payload }),
  updateEvent: (id, payload) => request(`/events/${id}`, { method: 'PATCH', body: payload }),
  cancelEvent: (id) => request(`/events/${id}/cancel`, { method: 'POST' }),
  archiveEvent: (id) => request(`/events/${id}/archive`, { method: 'POST' }),
  getRequirements: (eventId) => request(`/events/${eventId}/requirements`),
  updateRequirements: (eventId, requirements) => request(`/events/${eventId}/requirements`, { method: 'PUT', body: { requirements } }),
  calculateCapacity: (eventId, payload) => request(`/events/${eventId}/requirements/calculate`, { method: 'POST', body: payload }),

  // Allocations
  runAllocation: (eventId, payload) => request(`/events/${eventId}/allocations/runs`, { method: 'POST', body: payload }),
  getEventAllocations: (eventId) => request(`/events/${eventId}/allocations`),
  getAllocationVersion: (versionId) => request(`/allocations/${versionId}`),
  editAssignment: (versionId, payload) => request(`/allocations/${versionId}/assignments`, { method: 'PATCH', body: payload }),
  approveAllocation: (versionId, comment) => request(`/allocations/${versionId}/approve`, { method: 'POST', body: { comment } }),
  rejectAllocation: (versionId, comment) => request(`/allocations/${versionId}/reject`, { method: 'POST', body: { comment } }),
  publishAllocation: (versionId) => request(`/allocations/${versionId}/publish`, { method: 'POST' }),
  regenerateAllocation: (versionId, payload) => request(`/allocations/${versionId}/regenerate`, { method: 'POST', body: payload }),

  // Reports & Logs
  getStaffingReport: (eventId, versionId) => request(`/events/${eventId}/reports/staffing${versionId ? `?version_id=${versionId}` : ''}`),
  getUnderutilizationReport: (eventId, versionId) => request(`/events/${eventId}/reports/underutilization${versionId ? `?version_id=${versionId}` : ''}`),
  getAlgorithmComparison: (eventId) => request(`/events/${eventId}/reports/algorithm-comparison`),
  getRecommendations: (eventId) => request(`/events/${eventId}/reports/recommendations`),
  getReportChart: async (eventId) => (await getAuthorizedResponse(`/events/${eventId}/reports/chart`)).blob(),
  downloadRoster: (eventId, format = 'xlsx') => downloadFile(`/events/${eventId}/reports/roster?format=${encodeURIComponent(format)}`),
  getAuditLog: () => request('/audit-log'),

  // Simulations
  runSimulation: (eventId, payload) => request(`/events/${eventId}/simulations`, { method: 'POST', body: payload })
};
