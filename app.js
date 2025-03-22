let selectedGenres = new Set();

let currentUser = null;

async function loadBooks() {
    const params = {
        search: document.getElementById('searchInput').value,
        genres: Array.from(selectedGenres),
        yearFrom: document.getElementById('yearFrom').value,
        yearTo: document.getElementById('yearTo').value,
        rating: document.getElementById('ratingFilter').value,
        language: document.getElementById('languageFilter').value,
        sortBy: document.getElementById('sortBy').value
    };

    if (params.yearFrom && isNaN(params.yearFrom)) {
        alert("Год 'От' должен быть числом!");
        return;
    }
    
    if (params.yearTo && isNaN(params.yearTo)) {
        alert("Год 'До' должен быть числом!");
        return;
    }

    try {
        const query = new URLSearchParams(params).toString();
        const response = await fetch(`http://localhost:3000/products?${query}`);
        
        if (!response.ok) throw new Error(`Ошибка HTTP! Статус: ${response.status}`);
        
        const books = await response.json();
        renderBooks(books);
        updateFilters(books);
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка загрузки данных. Проверьте консоль для деталей.');
    }
}

function renderBooks(books) {
    const container = document.getElementById('bookContainer');
    
    container.innerHTML = books.length ? books.map(book => `
        <div class="book-card">
            ${book.cover ? `<img src="${book.cover}" class="cover-img" alt="${book.title}">` : ''}
            <div class="book-info">
                <h3>${book.title}</h3>
                <p class="author">${book.author}</p>
                <div class="meta">
                    <span>${book.year || 'Нет данных'}</span> • 
                    <span>${book.genre?.join(', ') || 'Без жанра'}</span> • 
                    <span class="rating">${book.rating ? '★'.repeat(book.rating) : 'Без рейтинга'}</span>
                </div>
                <p class="description">${book.description || ''}</p>
                ${book.language ? `<div class="language">Язык: ${book.language}</div>` : ''}
                <button class="rent-btn" onclick="rentBook('${book._id}')">Забронировать</button>
            </div>
        </div>
    `).join('') : '<p class="no-books">Книги не найдены</p>';
}

function updateFilters(books) {
    const genres = [...new Set(books.flatMap(book => book.genre || []))];
    const genreContainer = document.getElementById('genreFilters');
    
    const prevSelected = new Set(selectedGenres);
    selectedGenres = new Set([...prevSelected].filter(g => genres.includes(g)));

    genreContainer.innerHTML = genres.map(genre => `
        <label>
            <input 
                type="checkbox" 
                class="genre-checkbox" 
                value="${genre}"
                ${selectedGenres.has(genre) ? 'checked' : ''}
                onchange="handleGenreChange(this)"
            >
            ${genre}
        </label>
    `).join('');

    const languages = [...new Set(books.map(book => book.language).filter(Boolean))];
    const languageSelect = document.getElementById('languageFilter');
    const currentLanguage = languageSelect.value;
    
    languageSelect.innerHTML = `
        <option value="">Все языки</option>
        ${languages.map(lang => `
            <option value="${lang}" ${lang === currentLanguage ? 'selected' : ''}>${lang}</option>
        `).join('')}
    `;
}

function resetSearch() {
    document.getElementById('searchInput').value = '';
    loadBooks();
}

function resetFilters() {
    document.getElementById('yearFrom').value = '';
    document.getElementById('yearTo').value = '';
    document.getElementById('ratingFilter').value = '';
    document.getElementById('languageFilter').value = '';
    document.getElementById('sortBy').value = '';
    selectedGenres.clear();
    loadBooks();
}

function handleGenreChange(checkbox) {
    checkbox.checked ? selectedGenres.add(checkbox.value) : selectedGenres.delete(checkbox.value);
}

document.addEventListener('DOMContentLoaded', loadBooks);

function showAddBookForm() {
    const form = `
        <div class="admin-form">
            <input type="text" id="bookTitle" placeholder="Название">
            <input type="text" id="bookAuthor" placeholder="Автор">
            <button onclick="addBook()">Сохранить</button>
        </div>
    `;
    document.getElementById('bookManagement').innerHTML = form;
}

async function login() {
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (data.token) {
            localStorage.setItem('token', data.token);
            currentUser = { _id: data.userId, role: data.role };
            window.location.href = 'index.html';
        }
    } catch (error) {
        alert('Ошибка авторизации!');
    }
}

function updateAuthUI(role) {
    const authPanel = document.getElementById('authPanel');
    authPanel.innerHTML = `
        <div class="auth-logged-in">
            <span>Роль: ${role}</span>
            <button onclick="logout()">Выйти</button>
        </div>
    `;
}

async function addBook() {
    const bookData = {
        title: document.getElementById('newTitle').value,
        author: document.getElementById('newAuthor').value,
        genre: document.getElementById('newGenre').value.split(','),
    };

    try {
        await fetch('/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookData)
        });
        loadBooks();
    } catch (error) {
        alert('Ошибка добавления книги!');
    }
}

async function rentBook(bookId) {
    if (!currentUser) {
        alert('Для бронирования войдите в систему!');
        return;
    }

    const days = prompt('На сколько дней вы хотите забронировать книгу?');
    if (!days || isNaN(days)) {
        alert('Укажите корректное количество дней!');
        return;
    }

    try {
        const response = await fetch('/api/rent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                bookId,
                userId: currentUser._id,
                days: parseInt(days)
            })
        });

        if (response.ok) {
            alert('Книга успешно забронирована!');
        }
    } catch (error) {
        console.error('Ошибка бронирования:', error);
    }
}

// Показать форму регистрации
function showRegisterForm() {
    document.getElementById('registerForm').style.display = 'block';
}

// Скрыть форму регистрации
function hideRegisterForm() {
    document.getElementById('registerForm').style.display = 'none';
}

async function register() {
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const secret = document.getElementById('regSecret').value;
  
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, secret })
        });
  
        if (response.ok) {
            alert('Регистрация успешна!');
            window.location.href = 'login.html';
        }
    } catch (error) {
        alert('Ошибка регистрации!');
    }
  }

window.register = register;

// Выход из системы
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('userId');
    currentUser = null;
    document.getElementById('adminPanel').style.display = 'none';
    document.getElementById('authPanel').innerHTML = `
        <div>
            <input type="text" id="username" placeholder="Логин">
            <input type="password" id="password" placeholder="Пароль">
            <button onclick="login()">Войти</button>
            <button onclick="showRegisterForm()">Регистрация</button>
        </div>
    `;
}