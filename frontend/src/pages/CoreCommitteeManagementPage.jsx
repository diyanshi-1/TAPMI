import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Mail, Save, UserPlus, Users } from 'lucide-react';
import { api } from '../api/client';
import { Badge } from '../components/Badge';

export function CoreCommitteeManagementPage() {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedHeads, setSelectedHeads] = useState({});
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let current = true;
    async function loadPage() {
      setLoading(true);
      try {
        const [memberResponse, eventResponse] = await Promise.all([
          api.getCoreCommitteeMembers(),
          api.getEvents()
        ]);
        if (!current) return;
        setMembers(memberResponse.data || []);
        const publishedEvents = (eventResponse.data || []).filter(event => event.published_version_id);
        setEvents(publishedEvents);
        if (publishedEvents.length > 0) setSelectedEventId(String(publishedEvents[0].id));
      } catch (err) {
        if (current) setError(err.message || 'Could not load Core Committee management data.');
      } finally {
        if (current) setLoading(false);
      }
    }
    loadPage();
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!selectedEventId) {
      setDepartments([]);
      setSelectedHeads({});
      return undefined;
    }

    let current = true;
    async function loadDepartmentHeads() {
      setAssignmentLoading(true);
      setError('');
      try {
        const response = await api.getEventDepartmentHeads(selectedEventId);
        if (!current) return;
        const rows = response.data?.departments || [];
        setDepartments(rows);
        setSelectedHeads(Object.fromEntries(rows.map(row => [
          String(row.department_id), row.head_user_id ? String(row.head_user_id) : ''
        ])));
      } catch (err) {
        if (current) setError(err.message || 'Could not load department head assignments.');
      } finally {
        if (current) setAssignmentLoading(false);
      }
    }
    loadDepartmentHeads();
    return () => { current = false; };
  }, [selectedEventId]);

  async function handleCreateMember(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const response = await api.createCoreCommitteeMember({ full_name: fullName, email, password });
      setMembers(current => [...current, response.data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setFullName('');
      setEmail('');
      setPassword('');
      setSuccess(`${response.data.full_name} can now sign in as a Core Committee member.`);
    } catch (err) {
      setError(err.message || 'Could not create the Core Committee account.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveHeads() {
    if (!selectedEventId) return;
    setError('');
    setSuccess('');

    const selectedUserIds = departments
      .map(department => selectedHeads[String(department.department_id)])
      .filter(Boolean);
    if (new Set(selectedUserIds).size !== selectedUserIds.length) {
      const message = 'A Core Committee member can head only one department per event. Choose a different member for each department.';
      setError(message);
      window.alert(message);
      return;
    }

    setSaving(true);
    try {
      const assignments = departments.map(department => ({
        department_id: department.department_id,
        user_id: selectedHeads[String(department.department_id)] || null
      }));
      await api.saveEventDepartmentHeads(selectedEventId, assignments);
      setSuccess('Department heads saved. Members will see their departments and volunteer rosters when they sign in.');
      const response = await api.getEventDepartmentHeads(selectedEventId);
      const rows = response.data?.departments || [];
      setDepartments(rows);
      setSelectedHeads(Object.fromEntries(rows.map(row => [
        String(row.department_id), row.head_user_id ? String(row.head_user_id) : ''
      ])));
    } catch (err) {
      const message = err.message || 'Could not save department head assignments.';
      setError(message);
      if (err.data?.error?.code === 'CORE_MEMBER_ALREADY_ASSIGNED') window.alert(message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)' }}>Loading Core Committee tools...</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="h1">Core Committee</h1>
        <p className="text-muted" style={{ marginTop: '4px' }}>
          Create member accounts and assign a department head for each published event roster.
        </p>
      </div>

      {error && (
        <div className="banner banner-danger" role="alert" style={{ marginBottom: '16px' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="banner banner-success" role="status" style={{ marginBottom: '16px' }}>
          <CheckCircle2 size={16} /><span>{success}</span>
        </div>
      )}

      <section className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={18} color="var(--color-primary)" />
            <div>
              <h2 className="h3">Add a Core Committee Member</h2>
              <p className="text-muted text-sm">Create sign-in details for a new member.</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleCreateMember}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="core-member-name">Full name</label>
              <input id="core-member-name" className="form-input" value={fullName} onChange={event => setFullName(event.target.value)} maxLength={160} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="core-member-email">Email address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input id="core-member-email" type="email" className="form-input" style={{ paddingLeft: '36px' }} value={email} onChange={event => setEmail(event.target.value)} required />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="core-member-password">Temporary password</label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={15} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
                <input id="core-member-password" type="password" className="form-input" style={{ paddingLeft: '36px' }} value={password} onChange={event => setPassword(event.target.value)} minLength={8} required />
              </div>
              <span className="text-muted text-sm">At least 8 characters; share it with the member privately.</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              <UserPlus size={15} />{creating ? 'Creating...' : 'Create Member Account'}
            </button>
          </div>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={18} color="var(--color-primary)" />
            <div>
              <h2 className="h3">Committee Members</h2>
              <p className="text-muted text-sm">{members.length} member account{members.length === 1 ? '' : 's'}</p>
            </div>
          </div>
        </div>
        {members.length === 0 ? (
          <p className="text-muted text-sm">No Core Committee members have been added yet.</p>
        ) : (
          <div className="table-container">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Department Heads</th><th>Account</th></tr></thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 600 }}>{member.full_name}</td>
                    <td>{member.email}</td>
                    <td>{member.department_head_count || 0}</td>
                    <td><Badge type={member.status === 'active' ? 'success' : 'critical'}>{member.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-header" style={{ alignItems: 'flex-end' }}>
          <div>
            <h2 className="h3">Assign Department Heads</h2>
            <p className="text-muted text-sm">Head assignments are available after a volunteer roster is published.</p>
          </div>
          {events.length > 0 && (
            <div style={{ minWidth: '230px' }}>
              <label className="form-label" htmlFor="core-head-event">Published event</label>
              <select id="core-head-event" className="form-select" value={selectedEventId} onChange={event => { setSelectedEventId(event.target.value); setError(''); setSuccess(''); }}>
                {events.map(event => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {events.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '12px 0' }}>Publish an event roster before assigning department heads.</div>
        ) : members.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '12px 0' }}>Add Core Committee member accounts above before assigning department heads.</div>
        ) : assignmentLoading ? (
          <div className="text-muted text-sm" style={{ padding: '16px 0' }}>Loading departments...</div>
        ) : departments.length === 0 ? (
          <div className="text-muted text-sm" style={{ padding: '12px 0' }}>This event has no department staffing requirements.</div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead><tr><th>Department</th><th>Assigned Volunteers</th><th>Department Head</th></tr></thead>
                <tbody>
                  {departments.map(department => (
                    <tr key={department.department_id}>
                      <td style={{ fontWeight: 600 }}>{department.department_name}</td>
                      <td>{department.volunteer_count}</td>
                      <td>
                        <select
                          className="form-select"
                          aria-label={`Department head for ${department.department_name}`}
                          value={selectedHeads[String(department.department_id)] || ''}
                          onChange={event => {
                            const selectedUserId = event.target.value;
                            const alreadyHeadsAnotherDepartment = selectedUserId && departments.some(otherDepartment => (
                              otherDepartment.department_id !== department.department_id
                              && selectedHeads[String(otherDepartment.department_id)] === selectedUserId
                            ));
                            if (alreadyHeadsAnotherDepartment) {
                              const message = 'A Core Committee member can head only one department per event. Choose a different member for each department.';
                              setError(message);
                              window.alert(message);
                              return;
                            }
                            setError('');
                            setSelectedHeads(current => ({ ...current, [String(department.department_id)]: selectedUserId }));
                          }}
                        >
                          <option value="">Select a member</option>
                          {members.filter(member => member.status === 'active').map(member => {
                            const memberId = String(member.id);
                            const assignedToOtherDepartment = departments.some(otherDepartment => (
                              otherDepartment.department_id !== department.department_id
                              && selectedHeads[String(otherDepartment.department_id)] === memberId
                            ));
                            return (
                              <option key={member.id} value={member.id}>
                                {member.full_name} · {member.email}{assignedToOtherDepartment ? ' (heads another department)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn btn-primary" onClick={handleSaveHeads} disabled={saving || assignmentLoading}>
                <Save size={15} />{saving ? 'Saving...' : 'Save Department Heads'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
