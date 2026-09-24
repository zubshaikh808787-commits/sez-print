'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useDesk, useToast } from '@/components/desk';
import { Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/client';
import { ROLES } from '@/lib/constants';
import type { Admin, Role } from '@/lib/types';

export function SettingsDesk() {
  const me = useDesk();
  const toast = useToast();
  const [team, setTeam] = useState<Admin[]>([]);
  const [name, setName] = useState(me.name);
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [create, setCreate] = useState({ name: '', email: '', password: '', role: 'editor' as Role });
  const [confirmReset, setConfirmReset] = useState(false);

  function load() {
    api<{ admins: Admin[] }>('/api/admins').then((data) => setTeam(data.admins)).catch((reason: Error) => toast(reason.message, 'bad'));
  }

  useEffect(load, [toast]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    try {
      await api(`/api/admins/${me.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, password, currentPassword }),
      });
      setPassword('');
      setCurrentPassword('');
      toast('Profile saved. Sign in again if you changed the password.');
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not save', 'bad');
    }
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/api/admins', { method: 'POST', body: JSON.stringify(create) });
      setCreate({ name: '', email: '', password: '', role: 'editor' });
      toast('They can sign in now');
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not add them', 'bad');
    }
  }

  async function changeRole(admin: Admin, role: Role) {
    try {
      await api(`/api/admins/${admin.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not change role', 'bad');
    }
  }

  async function setActive(admin: Admin, active: boolean) {
    try {
      await api(`/api/admins/${admin.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
      load();
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not update', 'bad');
    }
  }

  async function restore() {
    try {
      await api('/api/desk/reset', { method: 'POST' });
      setConfirmReset(false);
      toast('Sample library restored');
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : 'Could not restore', 'bad');
    }
  }

  return (
    <>
      <PageHeader
        kicker="Access"
        title="Settings"
        lede="Owners decide who can publish. Editors run the library and feedback. Viewers can look, not change."
      />
      <div className="split">
        <form className="panel" onSubmit={saveProfile}>
          <h2>Your sign-in</h2>
          <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label="Email"><input value={me.email} disabled /></Field>
          <Field label="New password" hint="Leave blank to keep the current one.">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Current password" hint="Required only when you set a new password.">
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
          </Field>
          <div className="form-actions"><button className="btn primary" type="submit">Save profile</button></div>
        </form>
        <section className="panel">
          <h2>How counts work</h2>
          <p>The phone app has no accounts. A device is one install. Reinstalls and a second phone count again. Reviews stay attached to that device id.</p>
          <p className="meta">Files uploaded here are stored on this computer in admin/data. The records keep a URL, so a bucket can replace the folder later. Set SEZ_ADMIN_SECRET before anyone else can reach this desk.</p>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Team</h2>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th></tr>
          </thead>
          <tbody>
            {team.map((admin) => (
              <tr key={admin.id}>
                <td>{admin.name}</td>
                <td>{admin.email}</td>
                <td>
                  {me.role === 'owner' && admin.id !== me.id ? (
                    <select value={admin.role} onChange={(event) => changeRole(admin, event.target.value as Role)} aria-label={`Role for ${admin.name}`}>
                      {ROLES.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
                    </select>
                  ) : (
                    admin.role
                  )}
                </td>
                <td>
                  {me.role === 'owner' && admin.id !== me.id ? (
                    <button type="button" className="btn small" onClick={() => setActive(admin, !admin.active)}>
                      {admin.active ? 'Disable' : 'Enable'}
                    </button>
                  ) : (
                    admin.active ? 'Active' : 'Disabled'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {me.role === 'owner' ? (
          <form onSubmit={addPerson}>
            <h3>Add someone</h3>
            <div className="sizes">
              <Field label="Name"><input value={create.name} onChange={(event) => setCreate({ ...create, name: event.target.value })} required /></Field>
              <Field label="Email"><input type="email" value={create.email} onChange={(event) => setCreate({ ...create, email: event.target.value })} required /></Field>
            </div>
            <Field label="Password" hint="At least 8 characters.">
              <input type="text" value={create.password} onChange={(event) => setCreate({ ...create, password: event.target.value })} required minLength={8} />
            </Field>
            <div className="stack" style={{ marginTop: 12 }}>
              {ROLES.map((role) => (
                <label key={role.id}>
                  <input type="radio" name="role" checked={create.role === role.id} onChange={() => setCreate({ ...create, role: role.id })} /> {role.label} — {role.hint}
                </label>
              ))}
            </div>
            <div className="form-actions"><button className="btn primary" type="submit">Add to the desk</button></div>
          </form>
        ) : null}
      </section>
      {me.role === 'owner' ? (
        <section className="note" style={{ marginTop: 14 }}>
          <h2>Sample library</h2>
          <p>Restores the sample templates, art, prints, and feedback. People who can sign in stay as they are. Uploaded files in the library are removed.</p>
          {confirmReset ? (
            <div className="form-actions">
              <button type="button" className="btn danger" onClick={restore}>Yes, restore the sample</button>
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmReset(true)}>Restore sample desk</button>
          )}
        </section>
      ) : null}
    </>
  );
}
