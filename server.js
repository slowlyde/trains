require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// הגדרת ה-AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// חשוב: מאפשר לשרת לקרוא נתונים בפורמט JSON
app.use(express.json());
app.use(express.static('public'));

app.post('/analyze-video', upload.single('video'), async (req, res) => {
    try {
        // ולידציה בסיסית
        if (!req.file) return res.status(400).json({ error: "לא הועלה קובץ" });

        const videoPath = req.file.path;
        const trainingStyle = req.body.style || 'אגרוף קלאסי';
        const focusArea = req.body.focus || 'ניתוח כללי';

        // ה-Prompt המקצועי (המאמן מה-UFC)
        const promptInstruction = `
        אתה מאמן לחימה בכיר עם ניסיון של 20 שנה ב-UFC. 
        הסגנון שלך הוא אנליטי, קשוח אך מעודד.
        התלמיד בחר להתמקד ב: ${focusArea}.
        
        בצע ניתוח בשלבים:
        1. "דו"ח ביצועים": תן ציון 1-100 ל-${focusArea}.
        2. "דגשים טכניים": מנה 3 נקודות ספציפיות לתיקון. ציין זמנים בפורמט [MM:SS] (למשל [00:15]).
        3. "תרגיל בית": תן תרגיל אחד ספציפי לביצוע בבית.

        החזר HTML נקי בלבד (ללא הסברים מחוץ ל-HTML).
        `;

        // העלאת הוידאו ל-Gemini
        const uploadResult = await fileManager.uploadFile(videoPath, { mimeType: req.file.mimetype });
        
        // המתנה לעיבוד הוידאו
        let file = await fileManager.getFile(uploadResult.file.name);
        while (file.state === "PROCESSING") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResult.file.name);
        }

        // שימוש במודל - מומלץ להשתמש ב-gemini-2.0-flash או 1.5-flash
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const result = await model.generateContent([
            promptInstruction, 
            { fileData: { fileUri: uploadResult.file.uri, mimeType: uploadResult.file.mimeType } }
        ]);
        
        // ניקוי קבצים
        await fileManager.deleteFile(uploadResult.file.name);
        fs.unlinkSync(videoPath);

        // החזרת התשובה ללקוח
        res.json({ analysis: result.response.text().replace(/```html/g, '').replace(/```/g, '').trim() });
        
    } catch (error) {
        // טיפול בשגיאות
        if (req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        console.error("Error analyzing video:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Server running on port 3000'));