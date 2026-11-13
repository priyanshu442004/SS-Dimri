// Attendance additions of 12 Nov 2026: marking for others with a photo, photo check,
// lunch, client visits, mark-out reminders and daily workers.
export const HI_ATTENDANCE: Record<string, string> = {
  // Tabs and tiles
  "Mark for others": "दूसरों की उपस्थिति", "Photo check": "फ़ोटो जाँच", "Client visits": "क्लाइंट विज़िट", "Daily workers": "दैनिक कामगार",
  "No time out": "प्रस्थान समय नहीं", "Marked by a colleague": "सहकर्मी द्वारा दर्ज", "Photo attendance": "फ़ोटो उपस्थिति",
  "Hours can't be counted: fix them": "घंटे नहीं गिने जा सकते: ठीक करें", "Reminder at {#}": "रिमाइंडर {#} पर", "Fix": "ठीक करें",
  "On lunch": "भोजन अवकाश पर", Lunch: "भोजन अवकाश", "Long lunch": "लंबा भोजन अवकाश", "Show everyone": "सभी दिखाएँ",
  // Mark for others
  "Mark someone in or out": "किसी का आगमन या प्रस्थान दर्ज करें", Person: "व्यक्ति", "Type the name…": "नाम लिखें…",
  "Photo of the person": "व्यक्ति की फ़ोटो", "Take photo": "फ़ोटो लें", "Retake photo": "फ़ोटो दोबारा लें",
  "Record time in": "आगमन दर्ज करें", "Record time out": "प्रस्थान दर्ज करें", "Getting location…": "स्थान लिया जा रहा है…",
  "Note (optional)": "टिप्पणी (वैकल्पिक)", "e.g. Phone battery dead": "जैसे फ़ोन की बैटरी ख़त्म",
  "Not marked yet today": "आज अभी दर्ज नहीं", "Absent today": "आज अनुपस्थित", "On leave today": "आज छुट्टी पर", "Half day today": "आज आधा दिन",
  "In since {#}": "{#} से उपस्थित", "Team member": "टीम सदस्य", "Daily worker": "दैनिक कामगार",
  "Take a photo of the person first.": "पहले व्यक्ति की फ़ोटो लें।", "Take a photo of the person as proof of attendance.": "उपस्थिति के प्रमाण के लिए व्यक्ति की फ़ोटो लें।",
  "Marked by you today ({#})": "आज आपके द्वारा दर्ज ({#})", "Nobody yet. People you mark appear here with their photos.": "अभी कोई नहीं। जिन्हें आप दर्ज करेंगे वे फ़ोटो सहित यहाँ दिखेंगे।",
  "To mark yourself, use the My attendance tab.": "स्वयं के लिए 'मेरी उपस्थिति' टैब का उपयोग करें।",
  // Photo check
  "To check": "जाँच बाकी", "Marked absent": "अनुपस्थित चिह्नित", Accepted: "स्वीकृत", "Photo accepted": "फ़ोटो स्वीकृत", All: "सभी",
  "Looks genuine": "सही लगता है", "Not genuine – mark absent": "सही नहीं – अनुपस्थित करें", "Mark this person absent for the day?": "इस व्यक्ति को इस दिन अनुपस्थित करें?",
  "Note (needed to mark absent)": "टिप्पणी (अनुपस्थित करने के लिए आवश्यक)", "Note (change the decision)": "टिप्पणी (निर्णय बदलें)",
  "Nothing to check": "जाँच के लिए कुछ नहीं", "Every photo attendance in this period has been checked.": "इस अवधि की सभी फ़ोटो उपस्थिति जाँच ली गई हैं।",
  "Say why the photo is not genuine.": "बताएँ कि फ़ोटो सही क्यों नहीं है।", "Their senior or an administrator checks this one.": "इसकी जाँच उनके वरिष्ठ या व्यवस्थापक करेंगे।",
  "You marked this one, so another senior or an administrator checks it.": "यह आपने दर्ज किया है, इसलिए इसकी जाँच कोई अन्य वरिष्ठ या व्यवस्थापक करेंगे।",
  // Lunch
  "Start lunch": "भोजन अवकाश शुरू", "Back from lunch": "भोजन अवकाश से वापस", "Lunch started. Enjoy your meal.": "भोजन अवकाश शुरू हुआ।",
  "Welcome back. Lunch time is recorded.": "स्वागत है। भोजन अवकाश का समय दर्ज हुआ।", "Allowed: {}": "अनुमत: {}",
  "You are already on lunch.": "आप पहले से भोजन अवकाश पर हैं।", "Start lunch first.": "पहले भोजन अवकाश शुरू करें।",
  // Visits
  "Client visits today": "आज की क्लाइंट विज़िट", "Check in at client": "क्लाइंट पर पहुँचना दर्ज करें", "Move to next client": "अगले क्लाइंट पर जाएँ",
  "Check out from client": "क्लाइंट से निकलना दर्ज करें", "Or another place": "या कोई अन्य स्थान", "Purpose (optional)": "उद्देश्य (वैकल्पिक)",
  "You are here": "आप यहाँ हैं", "Pending for {}": "{} के लिए बाकी", "At a client right now": "अभी क्लाइंट पर", "People who visited clients": "क्लाइंट पर गए लोग",
  "Client stops": "क्लाइंट विज़िट", "No client visits": "कोई क्लाइंट विज़िट नहीं", "Not at a client": "क्लाइंट पर नहीं", Day: "दिन", Show: "दिखाएँ",
  "Visits end automatically when you mark out.": "प्रस्थान दर्ज करने पर विज़िट अपने-आप समाप्त हो जाती हैं।",
  "Mark in first, then check in at the client.": "पहले आगमन दर्ज करें, फिर क्लाइंट पर पहुँचना दर्ज करें।",
  // Reminders
  "You have not marked out yet": "आपने अभी प्रस्थान दर्ज नहीं किया है", "Remind to mark out at": "प्रस्थान का रिमाइंडर समय",
  // Daily workers
  "Day sheet": "दैनिक शीट", Pay: "भुगतान", Workers: "कामगार", "Add a daily worker": "दैनिक कामगार जोड़ें", "Add worker": "कामगार जोड़ें",
  "Daily wage (₹)": "दैनिक मज़दूरी (₹)", "Kind of work": "काम का प्रकार", "Contractor / agency": "ठेकेदार / एजेंसी", "Workers present": "उपस्थित कामगार",
  "Wages for the day": "दिन की मज़दूरी", "Earned in the period": "अवधि में कमाई", Paid: "भुगतान हुआ", "Still to pay": "भुगतान बाकी",
  "Mark paid": "भुगतान दर्ज करें", Undo: "पूर्ववत करें", "Wage / day": "मज़दूरी / दिन", "Full days": "पूरे दिन", "Half days": "आधे दिन",
  "Days worked": "काम के दिन", Earned: "कमाई", "To pay": "देय", "Save day": "दिन सहेजें", "Set inactive": "निष्क्रिय करें", "Make active": "सक्रिय करें",
  "Edit details or wage": "विवरण या मज़दूरी बदलें", "Record or correct a day by hand": "किसी दिन को हाथ से दर्ज या ठीक करें",
  "Present (full wage)": "उपस्थित (पूरी मज़दूरी)", "Half day (half wage)": "आधा दिन (आधी मज़दूरी)", "Absent (no wage)": "अनुपस्थित (मज़दूरी नहीं)",
  "No daily workers yet": "अभी कोई दैनिक कामगार नहीं", "Marked by": "दर्ज करने वाले", Wage: "मज़दूरी", Photos: "फ़ोटो",
};
