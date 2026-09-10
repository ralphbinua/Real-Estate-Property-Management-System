import { createContext, useState, useContext } from 'react';

// Create the context
const AuthContext = createContext();

// Create a custom hook for easy access
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // We will initialize this to null. When a user logs in, it will hold their data (e.g., { name: 'Ralph', role: 'Admin' })
  const [user, setUser] = useState(null);

  // Mock login function (we will connect this to your Express backend later)
  const login = (userData) => {
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};