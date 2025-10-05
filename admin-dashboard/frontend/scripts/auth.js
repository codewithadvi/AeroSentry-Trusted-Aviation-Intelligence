// frontend/scripts/auth.js (Fixed Version)

class AuthManager {
    static TOKEN_KEY = 'aerosentry_token';
    static USER_KEY = 'aerosentry_user';
    static API_BASE_URL = 'http://localhost:8000';

    static async login(username, password) {
        try {
            const response = await fetch(`${this.API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Login failed');
            }

            const data = await response.json();
            
            localStorage.setItem(this.TOKEN_KEY, data.access_token);
            localStorage.setItem(this.USER_KEY, JSON.stringify(data.user_data));
            
            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    static logout() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        window.location.href = '/index.html'; // Fixed: Redirect to login page
    }

    static getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }

    static getUser() {
        const userStr = localStorage.getItem(this.USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    }

    static isAuthenticated() {
        return !!this.getToken();
    }
    
    static checkExistingAuthAndRedirect() {
        if (this.isAuthenticated()) {
            this.redirectBasedOnRole();
        }
    }

    static redirectBasedOnRole() {
        const user = this.getUser();
        if (!user) {
            this.logout();
            return;
        }
        
        const currentPage = window.location.pathname;

        if (user.role === 'admin' && !currentPage.includes('admin-dashboard.html')) {
            window.location.href = 'admin-dashboard.html';
        } else if (user.role === 'pilot' && !currentPage.includes('pilot-dashboard.html')) {
            window.location.href = 'pilot-dashboard.html';
        }
    }
}

// Enhanced Logout Handler for both dashboards
class LogoutManager {
    static init() {
        // Add logout event listener to all logout buttons
        document.addEventListener('DOMContentLoaded', () => {
            const logoutButtons = document.querySelectorAll('#logout-btn');
            logoutButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    AuthManager.logout();
                });
            });

            // Also handle logout via keyboard
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'l') {
                    e.preventDefault();
                    AuthManager.logout();
                }
            });
        });
    }
}

// Login Form Handler
class LoginForm {
    constructor() {
        this.form = document.getElementById('login-form');
        this.usernameInput = document.getElementById('username');
        this.passwordInput = document.getElementById('password');
        this.loginButton = document.getElementById('login-button');
        this.loginText = document.getElementById('login-text');
        this.loginSpinner = document.getElementById('login-spinner');
        this.errorMessage = document.getElementById('error-message');

        if (this.form) {
            this.init();
        }
    }

    init() {
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        
        [this.usernameInput, this.passwordInput].forEach(input => {
            input.addEventListener('input', () => this.clearError());
        });

        AuthManager.checkExistingAuthAndRedirect();
    }

    async handleSubmit(e) {
        e.preventDefault();
        
        const username = this.usernameInput.value.trim();
        const password = this.passwordInput.value;

        if (!username || !password) {
            this.showError('Please enter both username and password');
            return;
        }

        this.setLoading(true);
        this.clearError();

        try {
            await AuthManager.login(username, password);
            this.showSuccess('Login successful! Redirecting...');
            
            setTimeout(() => {
                AuthManager.redirectBasedOnRole();
            }, 1000);

        } catch (error) {
            this.showError(error.message || 'Login failed. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    setLoading(loading) {
        if (loading) {
            this.loginButton.disabled = true;
            this.loginText.textContent = 'Signing In';
            this.loginSpinner.classList.remove('hidden');
        } else {
            this.loginButton.disabled = false;
            this.loginText.textContent = 'Sign In';
            this.loginSpinner.classList.add('hidden');
        }
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.remove('hidden');
        
        this.form.classList.add('shake-animation');
        setTimeout(() => {
            this.form.classList.remove('shake-animation');
        }, 500);
    }

    showSuccess(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.classList.remove('hidden', 'bg-red-500/20', 'border-red-500/50', 'text-red-400');
        this.errorMessage.classList.add('bg-green-500/20', 'border-green-500/50', 'text-green-400');
    }

    clearError() {
        this.errorMessage.classList.add('hidden');
        this.errorMessage.classList.remove('bg-green-500/20', 'border-green-500/50', 'text-green-400');
        this.errorMessage.classList.add('bg-red-500/20', 'border-red-500/50', 'text-red-400');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LoginForm();
    LogoutManager.init(); // Initialize logout functionality
});

// Add CSS for shake animation
const style = document.createElement('style');
style.textContent = `
    .shake-animation {
        animation: shake 0.5s ease-in-out;
    }
    
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);