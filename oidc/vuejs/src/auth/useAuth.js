import { ref, onMounted, computed, readonly } from 'vue';
import { PublicClientApplication, InteractionStatus } from '@azure/msal-browser';
import { msalInstance, loginRequest } from './msal.service';

const isAuthenticated = ref(false);
const user = ref(null);
const interactionStatus = ref(InteractionStatus.None);
const isLoading = ref(true);

// Whitelist of allowed email addresses from .env
// VITE_ALLOWED_EMAILS should be a comma-separated string
const allowedEmailsString = import.meta.env.VITE_ALLOWED_EMAILS || '';
const ALLOWED_EMAILS = allowedEmailsString
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0); // Filter out empty strings

 if (ALLOWED_EMAILS.length === 0) {
     console.warn("No allowed emails configured in VITE_ALLOWED_EMAILS. Authorization check might not work as expected.");
 }

const isAuthorizedUser = computed(() => {
    if (isAuthenticated.value && user.value?.username) {
        return ALLOWED_EMAILS.includes(user.value.username.toLowerCase());
    }
    return false;
});

// ... (initializeAuth, login, logout, event callback functions remain the same) ...
async function initializeAuth() {
    isLoading.value = true;
    console.log('--- MSAL Instance Inspection ---');
    console.log('msalInstance object:', msalInstance);

    if (msalInstance) {
        console.log('typeof msalInstance.getInteractionStatus:', typeof msalInstance.getInteractionStatus);
        console.log('typeof msalInstance.getAllAccounts:', typeof msalInstance.getAllAccounts);
        console.log('msalInstance hasOwnProperty("getInteractionStatus"):', msalInstance.hasOwnProperty('getInteractionStatus'));

        // Log the prototype chain to see where methods are defined
        let proto = Object.getPrototypeOf(msalInstance);
        let i = 0;
        while (proto && i < 5) { // Limit to 5 levels deep for brevity
            console.log(`Prototype level ${i}:`, proto);
            console.log(`  Has getInteractionStatus on this proto:`, proto.hasOwnProperty('getInteractionStatus'));
            console.log(`  Has getAllAccounts on this proto:`, proto.hasOwnProperty('getAllAccounts'));
            proto = Object.getPrototypeOf(proto);
            i++;
        }
    } else {
        console.error('CRITICAL: msalInstance is undefined in initializeAuth!');
    }
    console.log('--- End MSAL Instance Inspection ---');

    const accounts = msalInstance.getAllAccounts(); 
    if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
        user.value = accounts[0];
        isAuthenticated.value = true;
    }
    isLoading.value = false;
}

 async function login() {
     try {
         await msalInstance.loginRedirect(loginRequest);
     } catch (error) {
         console.error('Login failed:', error);
     }
 }

 async function logout() {
     const currentAccount = msalInstance.getActiveAccount();
     if (currentAccount) {
         try {
             await msalInstance.logoutRedirect({
                 account: currentAccount,
                 // postLogoutRedirectUri from msalConfig will be used if set
             });
         } catch (error) {
             console.error('Logout failed:', error);
         }
     } else {
         isAuthenticated.value = false;
         user.value = null;
     }
 }

 msalInstance.addEventCallback((event) => {
     if (event.eventType === "msal:loginSuccess" && event.payload.account) {
         msalInstance.setActiveAccount(event.payload.account);
         user.value = event.payload.account;
         isAuthenticated.value = true;
         isLoading.value = false;
     } else if (event.eventType === "msal:logoutSuccess") {
         isAuthenticated.value = false;
         user.value = null;
         isLoading.value = false;
     } else if (event.eventType === "msal:acquireTokenSuccess" && event.payload.account) {
         msalInstance.setActiveAccount(event.payload.account);
         user.value = event.payload.account;
         isAuthenticated.value = true;
         isLoading.value = false;
     }
     //     interactionStatus.value = msalInstance.getInteractionStatus();
 });

/* export function useAuth() {
     onMounted(initializeAuth);
     return {
         isAuthenticated,
         isAuthorizedUser,
         user,
         login,
         logout,
         isLoading,
         interactionStatus
     };
 }
*/

// --- Initialize auth state ONCE when the module is first imported ---
// This is a common pattern for singleton-like services.
// It will run after handleRedirectPromise in main.js if that involves a redirect.
// If no redirect, it runs immediately.
let initializationPromise = null;
function ensureInitialized() {
    if (!initializationPromise) {
        initializationPromise = initializeAuth();
    }
    return initializationPromise;
}
ensureInitialized(); // Trigger initialization as soon as this module is loaded.



// --- THE EXPORTED COMPOSABLE FUNCTION ---
// This function now simply returns a consistent set of reactive references.
export function useAuth() {
    // onMounted is useful if the component needs to trigger something on its own mount,
    // but the core auth initialization should be module-level.
    // We can use onMounted here to ensure we wait for the initial check if needed,
    // though `_isLoading` handles the UI part.
    onMounted(async () => {
        await ensureInitialized(); // Ensure initialization has completed
    });

    return {
        isAuthenticated: readonly(isAuthenticated), // Expose as readonly if mutations only happen via login/logout
        isAuthorizedUser, // This is already a computed, so it's fine
        user: readonly(user),
        login: login,
        logout: logout,
        isLoading: readonly(isLoading),
        interactionStatus: readonly(interactionStatus)
    };
}
