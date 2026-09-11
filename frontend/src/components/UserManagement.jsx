import { useState, useEffect, useMemo } from 'react';
import { Table, Badge, Alert, Tabs, Tab, Button, Card, Form, Modal, Spinner, InputGroup } from 'react-bootstrap';
import { fetchUsers, deleteUser } from '../services/userService';

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
  const [pendingDelete, setPendingDelete] = useState(null); // user object or null
  const [deleting, setDeleting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteUser(pendingDelete._id);
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
            <th className="fw-semibold border-0">Registered</th>
            <th className="fw-semibold border-0 text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map((user) => (
            <tr key={user._id}>
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
              <td className="text-muted small">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
              </td>
              <td className="text-end">
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => setPendingDelete(user)}
                >
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="fw-bold text-dark mb-0">User Directory</h4>
        <InputGroup style={{ width: 260 }}>
          <Form.Control
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="sm"
          />
        </InputGroup>
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