import { useState } from 'react';
import { Badge, Alert, Tabs, Tab, Button, Card, Form, Modal, Spinner, InputGroup } from 'react-bootstrap';
import Table from './ResponsiveTable.jsx';
import { fetchUsersPage, createUserByAdmin, updateUser, deleteUser } from '../services/userService';
import usePaginatedCollection from '../hooks/usePaginatedCollection';
import CollectionPagination from './CollectionPagination';
import { formatUserManagementError } from './userManagementErrors';

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
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('tenants');
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [deactivateError, setDeactivateError] = useState('');

  // Add User Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    password: '',
    role: 'Tenant',
  });

  // Edit User Form State
  const [showEditModal, setShowEditModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editUser, setEditUser] = useState({
    id: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    phone_number: '',
    email: '',
    role: 'Tenant',
    password: '',
  });

  const roles = activeTab === 'tenants' ? ['tenant'] : ['admin', 'property manager', 'agent', 'owner'];
  const { items: users, count, page, pageCount, loading, error: loadError, setPage, refresh } = usePaginatedCollection(
    fetchUsersPage,
    { roles: roles.join(','), search },
  );

  const handleOpenAddModal = () => {
    setCreateError('');
    setSuccess('');
    setShowAddModal(true);
  };

  const handleCloseAddModal = () => {
    if (creating) return;
    setShowAddModal(false);
    setCreateError('');
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    setSuccess('');

    try {
      await createUserByAdmin(newUser);
      setSuccess(`User ${[newUser.first_name, newUser.middle_name, newUser.last_name].filter(Boolean).join(' ') || newUser.email} created successfully!`);
      setShowAddModal(false);
      setNewUser({ first_name: '', middle_name: '', last_name: '', phone_number: '', email: '', password: '', role: 'Tenant' });
      refresh();
    } catch (err) {
      setCreateError(formatUserManagementError(err, 'Failed to create user account.'));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditModal = (user) => {
    setEditError('');
    setSuccess('');
    setEditUser({
      id: user._id || user.id,
      first_name: user.first_name || '',
      middle_name: user.middle_name || '',
      last_name: user.last_name || '',
      phone_number: user.phone_number || '',
      email: user.email || '',
      role: user.role || 'Tenant',
      password: '',
    });
    setShowEditModal(true);
  };

  const handleCloseEditModal = () => {
    if (updating) return;
    setShowEditModal(false);
    setEditError('');
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setUpdating(true);
    setEditError('');
    setSuccess('');

    try {
      const payload = {
        first_name: editUser.first_name,
        middle_name: editUser.middle_name,
        last_name: editUser.last_name,
        phone_number: editUser.phone_number,
        email: editUser.email,
        role: editUser.role,
      };
      if (editUser.password.trim()) {
        payload.password = editUser.password.trim();
      }

      await updateUser(editUser.id, payload);
      setSuccess(`User ${[editUser.first_name, editUser.middle_name, editUser.last_name].filter(Boolean).join(' ') || editUser.email} updated successfully!`);
      setShowEditModal(false);
      refresh();
    } catch (err) {
      setEditError(formatUserManagementError(err, 'Failed to update user account.'));
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDeactivateModal = (user) => {
    setDeactivateError('');
    setSuccess('');
    setPendingDelete(user);
  };

  const handleCloseDeactivateModal = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeactivateError('');
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeactivateError('');
    setSuccess('');
    try {
      const userId = pendingDelete._id || pendingDelete.id;
      await deleteUser(userId);
      setSuccess(`${pendingDelete.name} was deactivated.`);
      setPendingDelete(null);
      refresh();
    } catch (err) {
      setDeactivateError(formatUserManagementError(err, 'Failed to deactivate user account.'));
    } finally {
      setDeleting(false);
    }
  };

  const renderUserTable = () => {
    const q = search.trim().toLowerCase();
    if (loading) {
      return (
        <div className="text-center text-muted py-5">
          <Spinner animation="border" size="sm" className="me-2" />
          Loading accounts…
        </div>
      );
    }

    if (users.length === 0) {
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
      <Table hover responsive className="pm-users-table mb-0 align-middle bg-white">
        <thead>
          <tr className="text-muted small text-uppercase">
            <th className="fw-semibold border-0">Name</th>
            <th className="fw-semibold border-0">Email</th>
            <th className="fw-semibold border-0">Role</th>
            <th className="fw-semibold border-0 text-end">Action</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => {
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
                      onClick={() => handleOpenDeactivateModal(user)}
                    >
                      Deactivate
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
    <div className="pm-user-management">
      <div className="pm-user-toolbar">
        <div className="pm-user-toolbar-copy">
          <h4 className="fw-bold text-dark mb-0">User Directory</h4>
          <p className="text-muted mb-0">Create, search, and update staff and tenant accounts.</p>
        </div>
        <div className="pm-user-toolbar-actions">
          <InputGroup className="pm-user-search">
            <Form.Control
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="sm"
            />
          </InputGroup>
          <Button variant="primary" className="pm-user-add" onClick={handleOpenAddModal}>
            + Add User
          </Button>
        </div>
      </div>

      {loadError && <Alert variant="danger">{loadError}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <Tabs
            id="user-roles-tabs"
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k)}
            className="border-bottom px-3 pt-2 bg-light"
          >
            <Tab eventKey="staff" title="Staff">
              {renderUserTable()}
            </Tab>
            <Tab eventKey="tenants" title="Tenants">
              {renderUserTable()}
            </Tab>
          </Tabs>
          {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
        </Card.Body>
      </Card>

      {/* Modal: Create User Account */}
      <Modal show={showAddModal} onHide={handleCloseAddModal} centered aria-labelledby="create-user-dialog-title">
        <Modal.Header closeButton>
          <Modal.Title id="create-user-dialog-title" className="fs-5">Create New User Account</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateUser}>
          <Modal.Body>
            {createError && <Alert variant="danger" role="alert" aria-live="assertive">{createError}</Alert>}
            <Form.Group className="mb-3" controlId="create-user-first-name">
              <Form.Label className="fw-semibold small">First name</Form.Label>
              <Form.Control
                type="text"
                value={newUser.first_name}
                onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                required
                maxLength={150}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-middle-name">
              <Form.Label className="fw-semibold small">Middle name (optional)</Form.Label>
              <Form.Control value={newUser.middle_name} onChange={(e) => setNewUser({ ...newUser, middle_name: e.target.value })} maxLength={150} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-last-name">
              <Form.Label className="fw-semibold small">Last name</Form.Label>
              <Form.Control value={newUser.last_name} onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })} maxLength={150} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-phone">
              <Form.Label className="fw-semibold small">Phone number (optional)</Form.Label>
              <Form.Control type="tel" value={newUser.phone_number} onChange={(e) => setNewUser({ ...newUser, phone_number: e.target.value })} maxLength={30} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-email">
              <Form.Label className="fw-semibold small">Email Address</Form.Label>
              <Form.Control
                type="email"
                placeholder="john@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-password">
              <Form.Label className="fw-semibold small">Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="••••••••"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="create-user-role">
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
      <Modal show={showEditModal} onHide={handleCloseEditModal} centered aria-labelledby="edit-user-dialog-title">
        <Modal.Header closeButton>
          <Modal.Title id="edit-user-dialog-title" className="fs-5">Edit User Account</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleUpdateUser}>
          <Modal.Body>
            {editError && <Alert variant="danger" role="alert" aria-live="assertive">{editError}</Alert>}
            <Form.Group className="mb-3" controlId="edit-user-first-name">
              <Form.Label className="fw-semibold small">First name</Form.Label>
              <Form.Control
                type="text"
                value={editUser.first_name}
                onChange={(e) => setEditUser({ ...editUser, first_name: e.target.value })}
                required
                maxLength={150}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-middle-name">
              <Form.Label className="fw-semibold small">Middle name (optional)</Form.Label>
              <Form.Control value={editUser.middle_name} onChange={(e) => setEditUser({ ...editUser, middle_name: e.target.value })} maxLength={150} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-last-name">
              <Form.Label className="fw-semibold small">Last name</Form.Label>
              <Form.Control value={editUser.last_name} onChange={(e) => setEditUser({ ...editUser, last_name: e.target.value })} maxLength={150} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-phone">
              <Form.Label className="fw-semibold small">Phone number (optional)</Form.Label>
              <Form.Control type="tel" value={editUser.phone_number} onChange={(e) => setEditUser({ ...editUser, phone_number: e.target.value })} maxLength={30} />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-email">
              <Form.Label className="fw-semibold small">Email Address</Form.Label>
              <Form.Control
                type="email"
                placeholder="john@example.com"
                value={editUser.email}
                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-password">
              <Form.Label className="fw-semibold small">New Password (optional)</Form.Label>
              <Form.Control
                type="password"
                placeholder="Leave blank to keep current password"
                value={editUser.password}
                onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="edit-user-role">
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

      {/* Modal: Deactivate User Account */}
      <Modal show={!!pendingDelete} onHide={handleCloseDeactivateModal} centered aria-labelledby="deactivate-user-dialog-title">
        <Modal.Header closeButton>
          <Modal.Title id="deactivate-user-dialog-title" className="fs-5">Deactivate user account</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deactivateError && <Alert variant="danger" role="alert" aria-live="assertive">{deactivateError}</Alert>}
          Deactivate <strong>{pendingDelete?.name}</strong> ({pendingDelete?.email})? They will no longer be able to sign in. Their records will be retained.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <Spinner animation="border" size="sm" /> : 'Deactivate'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
