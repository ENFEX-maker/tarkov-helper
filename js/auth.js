// ============================================================================
// AUTH - Authentication functions
// ============================================================================

function showLoginModal() {
    document.getElementById('loginModal').style.display = 'flex';
    document.getElementById('loginEmail').focus();
    document.getElementById('loginError').style.display = 'none';
}

function hideLoginModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').style.display = 'none';
}

async function doLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');
    const submitBtn = document.getElementById('loginSubmitBtn');
    
    if (!email || !password) {
        errorDiv.textContent = 'Please enter email and password';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (!supabaseClient) {
        errorDiv.textContent = 'Authentication service not available';
        errorDiv.style.display = 'block';
        return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
    
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (error) throw error;
        
        hideLoginModal();
        updateAuthUI(data.user);
        console.log('Login successful:', data.user.email);
        
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed. Please check your credentials.';
        errorDiv.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Login';
    }
}

async function logout() {
    if (!supabaseClient) return;
    
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        isEditMode = false;
        updateAuthUI(null);
        updateEditModeUI();
        console.log('Logged out');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function updateAuthUI(user) {
    currentUser = user;
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');
    
    if (user) {
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userEmail.textContent = user.email;
    } else {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
        userEmail.textContent = '';
    }
}

function toggleEditMode() {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    isEditMode = !isEditMode;
    updateEditModeUI();
    
    // Make quest markers draggable/non-draggable
    if (questMarkersLayer) {
        questMarkersLayer.eachLayer(marker => {
            if (marker.dragging) {
                if (isEditMode) {
                    marker.dragging.enable();
                    marker._icon?.classList.add('leaflet-marker-draggable');
                } else {
                    marker.dragging.disable();
                    marker._icon?.classList.remove('leaflet-marker-draggable');
                }
            }
        });
    }
    
    // Make extract markers draggable/non-draggable
    if (typeof extractMarkers !== 'undefined') {
        extractMarkers.forEach(marker => {
            if (marker.dragging) {
                if (isEditMode) {
                    marker.dragging.enable();
                    marker._icon?.classList.add('extract-marker-draggable');
                } else {
                    marker.dragging.disable();
                    marker._icon?.classList.remove('extract-marker-draggable');
                }
            }
        });
    }
    
    // Re-render extract markers to show/hide edit buttons in popups
    if (typeof extractsEnabled !== 'undefined' && extractsEnabled) {
        renderExtractMarkers();
    }
    
    console.log('Edit mode:', isEditMode ? 'ON' : 'OFF');
}

function updateEditModeUI() {
    const badge = document.getElementById('editModeBadge');
    const btn = document.getElementById('editModeBtn');
    
    if (isEditMode) {
        badge.style.display = 'block';
        if (btn) {
            btn.classList.add('active');
            btn.innerHTML = '✏️ Exit Edit Mode';
        }
    } else {
        badge.style.display = 'none';
        if (btn) {
            btn.classList.remove('active');
            btn.innerHTML = '✏️ Edit Markers';
        }
    }
}

// Check auth state on load
async function checkAuthState() {
    if (!supabaseClient) return;
    
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
            updateAuthUI(user);
            console.log('Restored session for:', user.email);
        }
    } catch (error) {
        console.error('Error checking auth state:', error);
    }
}
