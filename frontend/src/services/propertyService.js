import api from './api';

// Fetch all properties from the backend
export const fetchProperties = async () => {
  const response = await api.get('/properties/');
  // DRF returns paginated responses if enabled, or a raw array
  return Array.isArray(response.data) ? response.data : response.data.results;
};

// Create a new property
export const createProperty = async (propertyData) => {
  const response = await api.post('/properties', propertyData);
  return response.data;
};

export const updateProperty = async (id, propertyData) => {
  const response = await api.put(`/properties/${id}`, propertyData);
  return response.data;
};

export const deleteProperty = async (id) => {
  const response = await api.delete(`/properties/${id}`);
  return response.data;
};