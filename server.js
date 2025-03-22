const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/my_database', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const productSchema = new mongoose.Schema({
    title: String,
    author: String,
    language: String,
    genre: [String],
    year: Number,
    description: String,
    rating: Number,
    cover: String
}, { versionKey: false });

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    role: { type: String, enum: ['admin', 'librarian', 'user'], default: 'user' }
});

const User = mongoose.model('User', userSchema); // <--- Важно!

const Product = mongoose.model('Product', productSchema);

app.get('/products', async (req, res) => {
    try {
        const { search, genres, yearFrom, yearTo, rating, language, sortBy } = req.query;
        const query = {};

        // Поиск
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } }
            ];
        }

        // Фильтры
        if (genres) query.genre = { $in: genres };
        if (yearFrom || yearTo) {
            query.year = {};
            if (yearFrom) query.year.$gte = Number(yearFrom);
            if (yearTo) query.year.$lte = Number(yearTo);
        }
        if (rating) query.rating = { $gte: Number(rating) };
        if (language) query.language = language;

        // Сортировка
        const sortOptions = {};
        if (sortBy) {
            const [field, order] = sortBy.startsWith('-') 
                ? [sortBy.slice(1), -1] 
                : [sortBy, 1];
            sortOptions[field] = order;
        }

        const products = await Product.find(query).sort(sortOptions);
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

// Маршрут регистрации
app.post('/register', async (req, res) => {
    try {
        const { username, password, secret } = req.body;
        
        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Создание пользователя
        const user = new User({
            username,
            password: hashedPassword,
            role: secret === "ADMIN_KEY_123" ? "admin" : "user" // проверки ключа
        });

        await user.save();
        res.status(201).json({ message: "Успех!" });

    } catch (error) {
        console.error("Ошибка:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Неверные учетные данные' 
            });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                error: 'Неверные учетные данные' 
            });
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            'your-secret-key',
            { expiresIn: '1h' }
        );

        res.json({
            role: user.role,
            token,
            userId: user._id.toString()
        });

    } catch (error) {
        res.status(500).json({ 
            error: 'Ошибка сервера',
            details: error.message 
        });
    }
});

// Проверка прав администратора
const checkAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Требуется авторизация' });

    try {
        const decoded = jwt.verify(token, 'your-secret-key');
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }
        req.user = decoded;
        next();
    } catch (error) {
        res.status(400).json({ error: 'Неверный токен' });
    }
};

// Добавление книги (только для админа)
app.post('/books', checkAdmin, async (req, res) => {
    try {
        const book = new Product(req.body);
        await book.save();
        res.status(201).json(book);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Обновление книги
app.put('/books/:id', async (req, res) => {
    try {
        const book = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(book);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Удаление книги
app.delete('/books/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: 'Book deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// После определения схемы Product
const rentalSchema = new mongoose.Schema({
    bookId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Product',
        required: true
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'overdue'],
        default: 'active'
    }
});

const Rental = mongoose.model('Rental', rentalSchema);

// Маршрут для бронирования
app.post('/api/rent', async (req, res) => {
    try {
        const { bookId, userId, days } = req.body;
        
        const rental = new Rental({
            bookId,
            userId,
            endDate: new Date(Date.now() + days * 86400000)
        });

        await rental.save();
        res.status(201).json(rental);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Защищенный маршрут для добавления книг (только для администратора)
app.post('/api/books', checkAdmin, async (req, res) => {
    try {
        // Валидация данных
        const { title, author } = req.body;
        if (!title || !author) {
            return res.status(400).json({ error: "Название и автор обязательны" });
        }

        // Создание новой книги
        const newBook = new Product({
            title: req.body.title,
            author: req.body.author,
            genre: req.body.genre || [],
            year: req.body.year || null,
            description: req.body.description || '',
            rating: req.body.rating || 0,
            language: req.body.language || 'Русский',
            cover: req.body.cover || ''
        });

        // Сохранение в базе данных
        const savedBook = await newBook.save();
        
        res.status(201).json({
            message: "Книга успешно добавлена",
            book: savedBook
        });

    } catch (error) {
        res.status(500).json({
            error: "Ошибка при добавлении книги",
            details: error.message
        });
    }
});