import { useState, useEffect, useMemo } from 'react';
import { Table, Badge, Alert, Tabs, Tab, Button, Card, Form, Modal, Spinner, InputGroup } from 'react-bootstrap';
import { fetchUsers, createUserByAdmin, updateUser, deleteUser } from '../services/userService';

const ROLE_GROUPS = {
  tenants: ['tenant'],
  staff: ['admin', 'property manager', 'agent', 'owner'],
};

const ROLE_COLORS = {
  tenant: 'info',
  admin: 'danger',
  'property manager': 'primary',
  agent: 'success',
  owner: 'dark',
};

function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('');
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('tenants');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Add User Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Tenant',
  });

  // Edit User Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editUser, setEditUser] = useState({
    id: '',
    name: '',
    email: '',
    role: 'Tenant',
    password: '',
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(Array.isArray(data) ? data : data.results || []);
      setError('');
    } catch (err) {
      setError('Failed to fetch user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');

    try {
      await createUserByAdmin(newUser);
      setSuccess(`User ${newUser.name || newUser.email} created successfully!`);
      setShowAddModal(false);
      setNewUser({ name: '', email: '', password: '', role: 'Tenant' });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to create user account.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditModal = (user) => {
    setEditUser({
      id: user._id || user.id,
      name: user.name || '',
      email: user.email || '',
      role: user.role || 'Tenant',
      password: '',
    });
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        name: editUser.name,
        email: editUser.email,
        role: editUser.role,
      };
      if (editUser.password.trim()) {
        payload.password = editUser.password.trim();
      }

      await updateUser(editUser.id, payload);
      setSuccess(`User ${editUser.name || editUser.email} updated successfully!`);
      setShowEditModal(false);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.detail || 'Failed to update user account.');
    } finally {
      setUpdating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const userId = pendingDelete._id || pendingDelete.id;
      await deleteUser(userId);
      setSuccess(`${pendingDelete.name} was removed.`);
      setPendingDelete(null);
      await loadUsers();
    } catch (err) {
      setError('Failed to delete user.');
    } finally {
      setDeleting(false);
    }
  };

  const counts = useMemo(() => {
    const c = { tenants: 0, staff: 0 };
    users.forEach((u) => {
      const role = u.role?.toLowerCase();
      if (ROLE_GROUPS.tenants.includes(role)) c.tenants += 1;
      else if (ROLE_GROUPS.staff.includes(role)) c.staff += 1;
    });
    return c;
  }, [users]);

  const renderUserTable = (roles) => {
    const q = search.trim().toLowerCase();
    const filteredUsers = users.filter((u) => {
      const role = u.role?.toLowerCase();
      if (!roles.includes(role)) return false;
      if (!q) return true;
      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
    });

    if (loading) {
      return (
        <div className="text-center text-muted py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading accounts…
        </div>
      );
    }

    if (filteredUsers.length === 0) {
      return (
        <div className="text-center text-muted py-5">
          <div className="fs-4 mb-1">No accounts found</div>
          <div className="small">
            {q ? 'Try a different search term.' : 'Nothing to show in this tab yet.'}
          </div>
        </div>
      );
    }

    return (
      <Table hover responsive className="mb-0 align-middle bg-white">
        <thead>
          <tr className="text-muted small text-uppercase">
            <th className="fw-semibold border-0">Name</th>
            <th className="fw-semibold border-0">Email</th>
            <th className="fw-semibold border-0">Role</th>
            <th className="fw-semibold border-0 text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((user) => {
            const userId = user._id || user.id;
            return (
              <tr key={userId}>
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <div
                      className="d-flex align-items-center justify-content-center rounded-circle bg-light text-secondary fw-semibold flex-shrink-0"
                      style={{ width: 36, height: 36, fontSize: 13 }}
                    >
                      {initials(user.name) || '?'}
                    </div>
                    <span className="fw-semibold text-dark">{user.name}</span>
                  </div>
                </td>
                <td className="text-secondary">{user.email}</td>
                <td>
                  <Badge bg={ROLE_COLORS[user.role?.toLowerCase()] || 'secondary'} className="fw-normal">
                    {user.role}
                  </Badge>
                </td>
                <td className="text-end">
                  <div className="d-flex justify-content-end gap-2">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => handleOpenEditModal(user)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => setPendingDelete(user)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="fw-bold text-dark mb-0">User Directory</h4>
        <div className="d-flex gap-2">
          <InputGroup style={{ width: 240 }}>
            <Form.Control
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="sm"
            />
          </InputGroup>
          <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
            + Add User
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <Tabs
            id="user-roles-tabs"
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="border-bottom px-3 pt-2 bg-light"
          >
            <Tab eventKey="staff" title={`Staff (${counts.staff})`}>
              {renderUserTable(ROLE_GROUPS.staff)}
            </Tab>
            <Tab eventKey="tenants" title={`Tenants (${counts.tenants})`}>
              {renderUserTable(ROLE_GROUPS.tenants)}
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>

      {/* Modal: Create User Account */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Create New User Account</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateUser}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Full Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. John Doe"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Email Address</Form.Label>
              <Form.Control
                type="email"
                placeholder="john@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Account Role</Form.Label>
              <Form.Select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="Tenant">Tenant</option>
                <option value="Property Manager">Property Manager</option>
                <option value="Agent">Agent</option>
                <option value="Owner">Owner</option>
                <option value="Admin">Admin</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowAddModal(false)} disabled={creating}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={creating}>
              {creating ? <Spinner animation="border" size="sm" /> : 'Create Account'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal: Edit User Account */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Edit User Account</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleUpdateUser}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Full Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. John Doe"
                value={editUser.name}
                onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Email Address</Form.Label>
              <Form.Control
                type="email"
                placeholder="john@example.com"
                value={editUser.email}
                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">New Password (optional)</Form.Label>
              <Form.Control
                type="password"
                placeholder="Leave blank to keep current password"
                value={editUser.password}
                onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold small">Account Role</Form.Label>
              <Form.Select
                value={editUser.role}
                onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
              >
                <option value="Tenant">Tenant</option>
                <option value="Property Manager">Property Manager</option>
                <option value="Agent">Agent</option>
                <option value="Owner">Owner</option>
                <option value="Admin">Admin</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowEditModal(false)} disabled={updating}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={updating}>
              {updating ? <Spinner animation="border" size="sm" /> : 'Save Changes'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modal: Delete User Account */}
      <Modal show={!!pendingDelete} onHide={() => setPendingDelete(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Delete user account</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Remove <strong>{pendingDelete?.name}</strong> ({pendingDelete?.email})? This can't be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <Spinner animation="border" size="sm" /> : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}