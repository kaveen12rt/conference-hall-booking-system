import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const translations = {
  "Conference Hall Booking": "සම්මන්ත්‍රණ ශාලා වෙන්කිරීම",
  "Ministry of Digital Economy": "ඩිජිටල් ආර්ථික අමාත්‍යාංශය",
  "Administrator access": "පරිපාලක ප්‍රවේශය",
  "Administrator": "පරිපාලක",
  "Public booking": "පොදු වෙන්කිරීම්",
  "Restricted access": "සීමිත ප්‍රවේශය",
  "Administrator accounts are provisioned by an authorized operator. Public registration is not available.": "පරිපාලක ගිණුම් බලයලත් නිලධාරියෙකු විසින් පමණක් සකස් කරනු ලැබේ. පොදු ලියාපදිංචිය ලබාගත නොහැක.",
  "Signed in": "පුරනය වී ඇත",
  "Sign out": "ඉවත් වන්න",
  "You have been signed out.": "ඔබ සාර්ථකව ඉවත් වී ඇත.",
  "Review pending bookings in the calendar. Approvals and decisions are emailed to the requester when email delivery is configured.": "දිනදර්ශනයේ පොරොත්තු වෙන්කිරීම් සමාලෝචනය කරන්න. Email පහසුකම සකස් කර ඇති විට අනුමැතිය සහ තීරණය ඉල්ලුම්කරුට email කරනු ලැබේ.",
  "Approve": "අනුමත කරන්න",
  "Reject": "ප්‍රතික්ෂේප කරන්න",
  "Cancel booking": "වෙන්කිරීම අවලංගු කරන්න",
  "Updating booking…": "වෙන්කිරීම යාවත්කාලීන කරමින්…",
  "Could not update the booking. Please refresh and try again.": "වෙන්කිරීම යාවත්කාලීන කළ නොහැකි විය. නැවත පූරණය කර උත්සාහ කරන්න.",
  "This booking was already updated. Refresh the calendar before trying again.": "මෙම වෙන්කිරීම දැනටමත් යාවත්කාලීන කර ඇත. නැවත උත්සාහ කිරීමට පෙර දිනදර්ශනය පූරණය කරන්න.",
  "Invalid booking status": "වෙන්කිරීමේ තත්ත්වය අවලංගුයි",
  "Facilities": "පහසුකම්",
  "Add a conference hall": "සම්මන්ත්‍රණ ශාලාවක් එක් කරන්න",
  "New halls become active on the public booking form.": "එක් කරන ශාලා පොදු වෙන්කිරීම් පෝරමයේ පෙන්වනු ලැබේ.",
  "Hall name": "ශාලාවේ නම",
  "Capacity": "ධාරිතාව",
  "Description": "විස්තරය",
  "Projector, Wi-Fi, sound system": "ප්‍රොජෙක්ටරය, Wi-Fi, ශබ්ද පද්ධතිය",
  "Separate facilities with commas.": "පහසුකම් කොමා මඟින් වෙන් කරන්න.",
  "Adding hall…": "ශාලාව එක් කරමින්…",
  "Add hall": "ශාලාව එක් කරන්න",
  "Active halls": "සක්‍රිය ශාලා",
  "No halls have been added yet.": "තවම ශාලා එක් කර නැත.",
  "Change password": "මුරපදය වෙනස් කරන්න",
  "Current password": "වත්මන් මුරපදය",
  "New password": "නව මුරපදය",
  "Use at least 12 characters. Passwords are limited to 72 UTF-8 bytes.": "අවම වශයෙන් අක්ෂර 12ක් භාවිතා කරන්න. මුරපදය UTF-8 බයිට් 72කට සීමා වේ.",
  "Saving…": "සුරකිමින්…",
  "Update password": "මුරපදය යාවත්කාලීන කරන්න",
  "Password changed. Your other admin sessions have been revoked.": "මුරපදය වෙනස් කරන ලදී. අනෙකුත් පරිපාලක සැසි අවලංගු කර ඇත.",
  "Admin sign in": "පරිපාලක පුරනය",
  "Username": "පරිශීලක නාමය",
  "Password": "මුරපදය",
  "Signing in…": "පුරනය වෙමින්…",
  "Sign in": "පුරනය වන්න",
  "Use 3-32 letters, numbers, dots, underscores, or hyphens.": "අකුරු, ඉලක්කම්, තිත්, යටි ඉරි හෝ හයිෆන් 3-32ක් භාවිතා කරන්න.",
  "Authorized administrators only.": "බලයලත් පරිපාලකයින්ට පමණි.",
  "Ministry of Digital Economy · Sri Lanka": "ඩිජිටල් ආර්ථික අමාත්‍යාංශය · ශ්‍රී ලංකාව",
  "Conference hall reservations": "සම්මන්ත්‍රණ ශාලා වෙන්කිරීම්",
  "Check the public schedule and submit a reservation request online. No account is needed.": "පොදු කාලසටහන පරීක්ෂා කර අන්තර්ජාලයෙන් වෙන්කිරීමේ ඉල්ලීමක් යොමු කරන්න. ගිණුමක් අවශ්‍ය නොවේ.",
  "Online service information": "මාර්ගගත සේවා තොරතුරු",
  "Public access": "පොදු ප්‍රවේශය",
  "No account required": "ගිණුමක් අවශ්‍ය නොවේ",
  "Reservation details": "වෙන්කිරීමේ විස්තර",
  "Submit a booking request": "වෙන්කිරීමේ ඉල්ලීමක් යොමු කරන්න",
  "Complete the required fields to send your request for review.": "ඔබගේ ඉල්ලීම සමාලෝචනය සඳහා යොමු කිරීමට අවශ්‍ය තොරතුරු පුරවන්න.",
  "Loading available halls…": "ලබාගත හැකි ශාලා පූරණය වෙමින්…",
  "Halls could not be loaded": "ශාලා පූරණය කළ නොහැකි විය",
  "Please try again later or contact the service administrator.": "පසුව නැවත උත්සාහ කරන්න හෝ සේවා පරිපාලක අමතන්න.",
  "No halls are currently available to request. Please check again later.": "දැනට ඉල්ලීමක් කළ හැකි ශාලා නොමැත. පසුව නැවත පරීක්ෂා කරන්න.",
  "Conference hall": "සම්මන්ත්‍රණ ශාලාව",
  "Select a hall": "ශාලාවක් තෝරන්න",
  "Meeting title": "රැස්වීමේ මාතෘකාව",
  "Expected participants": "අපේක්ෂිත සහභාගිවන්නන්",
  "Date": "දිනය",
  "Start time": "ආරම්භක වේලාව",
  "End time": "අවසන් වේලාව",
  "Purpose": "අරමුණ",
  "Contact name": "සම්බන්ධතා නම",
  "Contact email": "සම්බන්ධතා විද්‍යුත් තැපෑල",
  "Contact phone": "සම්බන්ධතා දුරකථන අංකය",
  "Additional requirements": "අමතර අවශ්‍යතා",
  "Leave this field empty": "මෙම ක්ෂේත්‍රය හිස්ව තබන්න",
  "Request submitted.": "ඉල්ලීම යොමු කරන ලදී.",
  "Your request is now visible on the public schedule. Personal details remain private.": "ඔබගේ ඉල්ලීම දැන් පොදු කාලසටහනේ පෙන්වයි. පුද්ගලික තොරතුරු රහස්‍යව පවතී.",
  "A confirmation email has been queued.": "තහවුරු කිරීමේ email එක යැවීමට පෝලිම්ගත කර ඇත.",
  "Email delivery is not configured yet. Contact the administrator for updates.": "Email යැවීම තවම සකස් කර නැත. යාවත්කාලීන සඳහා පරිපාලක අමතන්න.",
  "Submitting…": "යොමු කරමින්…",
  "Submit booking request": "වෙන්කිරීමේ ඉල්ලීම යොමු කරන්න",
  "Checking session…": "සැසිය පරීක්ෂා කරමින්…",
  "The public schedule shows reserved dates, times and halls only. Meeting and contact details are private.": "පොදු කාලසටහනේ වෙන්කර ඇති දිනය, වේලාව සහ ශාලාව පමණක් පෙන්වයි. රැස්වීම් සහ සම්බන්ධතා විස්තර රහස්‍ය වේ.",
  "This time overlaps a reserved slot ({start}–{end}). Choose another time.": "මෙම වේලාව වෙන්කර ඇති වේලාවක් ({start}–{end}) සමඟ ගැටේ. වෙනත් වේලාවක් තෝරන්න.",
  "No pending or approved reservation overlaps this time. The server checks again when you submit.": "මෙම වේලාව සමඟ පොරොත්තු හෝ අනුමත වෙන්කිරීමක් ගැටෙන්නේ නැත. යොමු කරන විට සේවාදායකය නැවත පරීක්ෂා කරයි.",
  "Times use 15-minute increments. Changing the start time moves the end forward when needed; choose a hall and date to check listed reservations.": "වේලාවන් මිනිත්තු 15ක පරතරයෙන් තෝරාගත හැක. අවශ්‍ය විට ආරම්භක වේලාව වෙනස් කිරීමෙන් අවසන් වේලාව ඉදිරියට ගෙනයයි. වෙන්කිරීම් පරීක්ෂා කිරීමට ශාලාවක් සහ දිනයක් තෝරන්න.",
  "Choose start and end times in 15-minute increments, such as 09:00 or 09:15.": "ආරම්භක සහ අවසන් වේලාවන් 09:00 හෝ 09:15 වැනි මිනිත්තු 15ක පරතරයෙන් තෝරන්න.",
  "End time must be later than start time.": "අවසන් වේලාව ආරම්භක වේලාවට පසුව විය යුතුය.",
  "Booking calendar": "වෙන්කිරීම් දිනදර්ශනය",
  "Hall availability": "ශාලා වෙන්කිරීම් කාලසටහන",
  "Public schedule": "පොදු වෙන්කිරීම් කාලසටහන",
  "Public booking schedule": "පොදු වෙන්කිරීම් කාලසටහන",
  "View reserved dates, times and halls. Meeting and contact details are private.": "වෙන්කර ඇති දිනයන්, වේලාවන් සහ ශාලා බලන්න. රැස්වීම් සහ සම්බන්ධතා විස්තර රහස්‍ය වේ.",
  "Public availability": "පොදු ලබාගත හැකි වේලාවන්",
  "Filter by hall": "ශාලාව අනුව පෙරහන් කරන්න",
  "All halls": "සියලු ශාලා",
  "Previous month": "පෙර මාසය",
  "Next month": "ඊළඟ මාසය",
  "Today": "අද",
  "Bookings": "වෙන්කිරීම්",
  "Reserved time": "වෙන්කර ඇති වේලාවන්",
  "No reservations listed": "වෙන්කිරීම් සඳහන් කර නැත",
  "Updating calendar…": "දිනදර්ශනය යාවත්කාලීන වෙමින්…",
  "Waiting for calendar data…": "දිනදර්ශන දත්ත බලාපොරොත්තුවෙන්…",
  "Auto-refreshes every 30 seconds": "තත්පර 30කට වරක් ස්වයංක්‍රීයව යාවත්කාලීන වේ",
  "No bookings on this date.": "මෙම දිනයේ වෙන්කිරීම් නොමැත.",
  "No reserved times currently listed for this date.": "මෙම දිනය සඳහා වෙන්කළ වේලාවන් දැනට සඳහන් කර නැත.",
  "Hall": "ශාලාව",
  "Reserved": "වෙන්කර ඇත",
  "English": "English",
  "සිංහල": "සිංහල",
  "Switch to light theme": "ආලෝක තේමාවට මාරු වන්න",
  "Switch to dark theme": "අඳුරු තේමාවට මාරු වන්න",
  "Display preferences": "දර්ශන සැකසුම්",
  "Language": "භාෂාව",
  "Dark theme": "අඳුරු තේමාව",
  "Light theme": "ආලෝක තේමාව",
  "Minute": "මිනිත්තු",
  "pending": "පොරොත්තුවෙන්",
  "approved": "අනුමතයි",
  "rejected": "ප්‍රතික්ෂේපයි",
  "cancelled": "අවලංගුයි",
  "No bookings on this date": "මෙම දිනයේ වෙන්කිරීම් නොමැත",
  "Waiting for calendar data": "දිනදර්ශන දත්ත බලාපොරොත්තුවෙන්",
  "Availability not loaded": "ලබාගත හැකි වේලාවන් පූරණය වී නැත",
  "Last updated": "අවසන් යාවත්කාලීන කිරීම",
  "Please sign in with an administrator account.": "පරිපාලක ගිණුමකින් පුරනය වන්න.",
  "Too many booking attempts. Please try again later.": "වෙන්කිරීම් උත්සාහයන් වැඩිය. පසුව නැවත උත්සාහ කරන්න.",
  "That time was just booked. Refresh the calendar and choose another time.": "එම වේලාව මේ අතරතුර වෙන්කර ඇත. දිනදර්ශනය නැවත පූරණය කර වෙනත් වේලාවක් තෝරන්න.",
  "That hall is unavailable or cannot accommodate the participants.": "එම ශාලාව ලබාගත නොහැක, නැතහොත් සහභාගිවන්නන්ට ප්‍රමාණවත් නොවේ.",
  "Check the hall name, capacity, description, and facilities.": "ශාලාවේ නම, ධාරිතාව, විස්තරය සහ පහසුකම් පරීක්ෂා කරන්න.",
  "Check the form details and try again.": "පෝරමයේ තොරතුරු පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
  "The username or password is incorrect.": "පරිශීලක නාමය හෝ මුරපදය වැරදිය.",
  "Use a password of 12 to 72 UTF-8 bytes.": "UTF-8 බයිට් 12ත් 72ත් අතර මුරපදයක් භාවිතා කරන්න.",
  "Too many login attempts. Please wait before trying again.": "පුරනය වීමේ උත්සාහයන් වැඩිය. නැවත උත්සාහ කිරීමට පෙර රැඳී සිටින්න.",
  "This request was blocked. Reload the page and try again.": "මෙම ඉල්ලීම අවහිර කරන ලදී. පිටුව නැවත පූරණය කර උත්සාහ කරන්න.",
  "Choose a new password different from your current password.": "වත්මන් මුරපදයට වෙනස් නව මුරපදයක් තෝරන්න.",
  "The current password is incorrect.": "වත්මන් මුරපදය වැරදිය.",
  "Too many status checks. Please try again later.": "තත්ත්ව පරීක්ෂා කිරීම් වැඩිය. පසුව නැවත උත්සාහ කරන්න.",
  "There have been many requests from this browser. Please wait a few minutes and try again.": "මෙම බ්‍රවුසරයෙන් ඉල්ලීම් බොහොමයක් ලැබී ඇත. මිනිත්තු කිහිපයක් රැඳී සිට නැවත උත්සාහ කරන්න.",
  "The request could not be completed. Please try again.": "ඉල්ලීම සම්පූර්ණ කළ නොහැකි විය. නැවත උත්සාහ කරන්න.",
  "Hall added successfully.": "ශාලාව සාර්ථකව එක් කරන ලදී.",
};

const PreferencesContext = createContext(null);

function storedValue(key, fallback, allowedValues) {
  try {
    const value = window.localStorage.getItem(key);
    return allowedValues.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function PreferencesProvider({ children }) {
  const [language, setLanguage] = useState(() =>
    storedValue("booking-language", "en", ["en", "si"]),
  );
  const [theme, setTheme] = useState(() =>
    storedValue("booking-theme", "dark", ["light", "dark"]),
  );

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("booking-language", language);
      window.localStorage.setItem("booking-theme", theme);
    } catch {
      // Preferences remain usable for the current page if storage is unavailable.
    }
  }, [language, theme]);

  const t = useCallback(
    (text, values = {}) =>
      Object.entries(values).reduce(
        (translated, [key, value]) => translated.replaceAll(`{${key}}`, value),
        language === "si" ? translations[text] ?? text : text,
      ),
    [language],
  );
  const value = useMemo(
    () => ({ language, setLanguage, theme, setTheme, t }),
    [language, setLanguage, theme, setTheme, t],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) {
    throw new Error("usePreferences must be used within PreferencesProvider.");
  }
  return preferences;
}

export function SitePreferences() {
  const { language, setLanguage, theme, setTheme, t } = usePreferences();

  return (
    <div className="site-preferences" aria-label={t("Display preferences")}>
      <button
        className="theme-toggle"
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label={t(theme === "dark" ? "Switch to light theme" : "Switch to dark theme")}
        title={t(theme === "dark" ? "Switch to light theme" : "Switch to dark theme")}
      >
        {theme === "dark" ? "☀" : "☾"}
      </button>
      <div className="language-toggle" role="group" aria-label={t("Language")}>
        <button
          type="button"
          className={language === "en" ? "active" : ""}
          aria-pressed={language === "en"}
          onClick={() => setLanguage("en")}
        >
          English
        </button>
        <button
          type="button"
          className={language === "si" ? "active" : ""}
          aria-pressed={language === "si"}
          onClick={() => setLanguage("si")}
        >
          සිංහල
        </button>
      </div>
      <span className="theme-label">{t(theme === "dark" ? "Dark theme" : "Light theme")}</span>
    </div>
  );
}
