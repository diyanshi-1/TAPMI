import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Mail, MapPin, Users } from 'lucide-react';
import { api } from '../api/client';
import { Badge } from '../components/Badge';

function formatDate(value) {
  if (!value) return 'Date not set';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString([], {
    dateStyle: 'medium', timeStyle: 'short'
  });
}

export function CoreCommitteeDashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    api.getMyDepartmentAssignments()
      .then(response => { if (current) setEvents(response.data || []); })
      .catch(err => { if (current) setError(err.message || 'Could not load your department assignments.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 className="h1">Core Committee Dashboard</h1>
        <p className="text-muted" style={{ marginTop: '4px' }}>
          Your assigned event departments and the published volunteer rosters.
        </p>
      </div>

      {error && (
        <div className="banner banner-danger" role="alert" style={{ marginBottom: '16px' }}>
          <AlertCircle size={16} /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="card text-muted" style={{ padding: '32px', textAlign: 'center' }}>Loading your department assignments...</div>
      ) : events.length === 0 ? (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center' }}>
          <Users size={32} color="var(--color-muted)" style={{ margin: '0 auto 12px' }} />
          <h2 className="h3">No Department Assignments Yet</h2>
          <p className="text-muted text-sm" style={{ maxWidth: '460px', margin: '8px auto 0' }}>
            Once the Convener or Co-convener assigns you as a department head for a published event, its details and volunteer contact list will appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {events.map(event => (
            <section key={event.event_id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px' }}>
                <div>
                  <h2 className="h2">{event.event_name}</h2>
                  {event.event_description && <p className="text-muted text-sm" style={{ marginTop: '5px' }}>{event.event_description}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', marginTop: '12px', color: 'var(--color-muted)', fontSize: '13px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><CalendarDays size={14} />{formatDate(event.starts_at)} – {formatDate(event.ends_at)}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><MapPin size={14} />{event.venue}</span>
                  </div>
                </div>
                <Badge type={event.event_status}>{event.event_status}</Badge>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {event.departments.map(department => (
                  <div key={department.department_id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '13px 16px', background: 'var(--color-subtle)' }}>
                      <div>
                        <h3 className="h3">{department.department_name}</h3>
                        <div className="text-muted text-sm" style={{ marginTop: '3px' }}>Department Head</div>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-muted)', fontSize: '13px' }}>
                        <Users size={15} />{department.volunteers.length} volunteer{department.volunteers.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    {department.volunteers.length === 0 ? (
                      <div className="text-muted text-sm" style={{ padding: '16px' }}>No volunteers are assigned to this department in the current published roster.</div>
                    ) : (
                      <div className="table-container">
                        <table>
                          <thead><tr><th>Volunteer</th><th>Email</th><th>Assigned Role</th></tr></thead>
                          <tbody>
                            {department.volunteers.map((volunteer, index) => (
                              <tr key={`${volunteer.id}-${index}`}>
                                <td style={{ fontWeight: 600 }}>{volunteer.full_name}</td>
                                <td><a href={`mailto:${volunteer.email}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-primary-hover)' }}><Mail size={14} />{volunteer.email}</a></td>
                                <td>{volunteer.role_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
