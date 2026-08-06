//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type Auth, type User, onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

/**
 * Returns currently authenticated user.
 * null = no user is authenticated.
 * undefined = initial state.
 */
export const useAuthUser = (auth: Auth) => {
  const [user, setUser] = useState<User | null>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, [auth]);

  return user;
};
