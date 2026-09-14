import axios from 'axios';

const API_URL = 'http://localhost:5000/api/invoices';

// Get token helper
const getAuthHeaders = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  return {
    headers: {
      Authorization: `Bearer ${user?.token}`,
    },
  };
};

export const fetchInvoices = async () => {
  const response = await axios.get(API_URL, getAuthHeaders());
  return response.data;
};

export const generateMonthlyInvoices = async () => {
  const response = await axios.post(`${API_URL}/generate`, {}, getAuthHeaders());
  return response.data;
};

export const updateInvoiceStatus = async (id, status) => {
  const response = await axios.put(`${API_URL}/${id}`, { status }, getAuthHeaders());
  return response.data;
};