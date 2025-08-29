// Menu data - will be fetched from API
let menuData = {
  categories: [],
  menu_items: []
};

// State
let activeCategory = "all"
let cart = []
let isManagerAuthenticated = false
let longPressTimer = null
let currentTableUUID = null
let currentTableNumber = null

// API Base URL
const API_BASE_URL = window.location.origin + '/api';

// DOM Elements
const categoryChips = document.getElementById("category-chips")
const menuGrid = document.getElementById("menu-grid")
const cartButton = document.getElementById("cart-button")
const cartBadge = document.getElementById("cart-badge")
const cartOverlay = document.getElementById("cart-overlay")
const cartItems = document.getElementById("cart-items")
const cartTotalPrice = document.getElementById("cart-total-price")
const managerModal = document.getElementById("manager-modal")
const managerPassword = document.getElementById("manager-password")
const managerBadge = document.getElementById("manager-badge")
const itemModal = document.getElementById("item-modal")
const itemModalImg = document.getElementById("item-modal-img")
const itemModalName = document.getElementById("item-modal-name")
const itemModalDescription = document.getElementById("item-modal-description")
const itemModalPrice = document.getElementById("item-modal-price")
const itemModalAddBtn = document.getElementById("item-modal-add-btn")

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  // Extract table UUID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentTableUUID = urlParams.get('table_uuid');
  if (currentTableUUID) {
    fetchMenuByUUID(currentTableUUID);
  } else {
    fetchMenu();
  }
  
  setupEventListeners()

  // Add fade-in animation to body
  setTimeout(() => {
    document.body.style.opacity = "1"
    document.body.style.transform = "translateY(0)"
  }, 100)
})

  // Function to show toaster messages
  function showToast(message, type = "error") {
    const toastContainer = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.classList.add('toast', type);
      toast.textContent = message;

      // Append toast to the container
      toastContainer.appendChild(toast);

      // Make the container visible
      toastContainer.style.display = 'block';

      // Trigger the fade-in animation
      setTimeout(() => {
          toast.classList.add('fade-out');
      }, 4500); // After 4.5s, fade out the toast

      // After the animation completes, hide the container and remove the toast
      setTimeout(() => {
          toastContainer.style.display = 'none';
          toast.remove();
      }, 6000); 
  }


// API Functions
async function fetchMenu() {
  try {
    const response = await fetch(`${API_BASE_URL}/menu/`);
    const data = await response.json();
    menuData = data;
    renderCategories();
    renderMenuItems();
  } catch (error) {
    console.error('Error fetching menu:', error);
    showToast(error.message || 'Failed to load menu. Please try again.');
  }
}

async function fetchMenuByUUID(uuid) {
  try {
    const response = await fetch(`${API_BASE_URL}/menu/${uuid}/`);
    const data = await response.json();
    menuData = data;
    currentTableNumber = data.table_number;
    renderCategories();
    renderMenuItems();
    
    // Update page title with table number
    document.title = `Table ${currentTableNumber} - TK-Brown Coffee`;
  } catch (error) {
    console.error('Error fetching menu by UUID:', error);
    showToast(error.message || 'Invalid QR code. Please scan a valid QR code.');
  }
}

async function placeOrder(orderData) {
  try {
    const response = await fetch(`${API_BASE_URL}/orders/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCSRFToken()
      },
      body: JSON.stringify(orderData)
    });
    
    if (response.ok) {
      const order = await response.json();
      return order;
    } else {
      throw new Error('Failed to place order');
    }
  } catch (error) {
    console.error('Error placing order:', error);
    showToast(error.message || 'Failed to place order. Please try again.');
    throw error;
  }
}

async function managerLogin(username, password) {
  try {
    // Retrieve the CSRF token from the cookies
    const csrfToken = getCSRFToken();

    const response = await fetch(`${API_BASE_URL}/manager/login/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,  // Add CSRF token here
      },
      body: JSON.stringify({ username, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.token;
    } else {
      const errorData = await response.json();
      console.error('Login failed:', errorData);
      throw new Error(errorData?.detail || 'Login failed. Please check your credentials.');
    }
  } catch (error) {
    console.error('Error logging in:', error);
    showToast(error.message || 'Error logging in. Please try again.');
    throw error;
  }
}

// Function to get the CSRF token from cookies
function getCSRFToken() {
  const name = 'csrftoken=';
  const value = document.cookie.split(';').find(row => row.startsWith(name));
  if (value) {
    return value.split('=')[1];
  }
  return '';
}

// Render functions
function renderCategories() {
  const allCategories = [{ id: "all", name: "All", icon: "🍽️" }];
  const menuCategories = menuData.categories.map(cat => ({
    id: cat.id.toString(),
    name: cat.name,
    icon: getCategoryIcon(cat.name)
  }));
  
  const categories = [...allCategories, ...menuCategories];
  
  categoryChips.innerHTML = categories
    .map(
      (category) => `
        <button class="category-chip ${category.id === activeCategory ? "active" : ""}"
                data-category="${category.id}">
            <span>${category.icon}</span> ${category.name}
        </button>
    `,
    )
    .join("")
}

function getCategoryIcon(categoryName) {
  const iconMap = {
    'Starters': '🥗',
    'Main Dishes': '🥩',
    'Desserts': '🍰',
    'Drinks': '🍷',
    'Appetizers': '🥗',
    'Main Course': '🍝',
    'Beverages': '☕',
    'Sides': '🍟'
  };

  // Check if the category has an emoji at the beginning, and if so, return it as is
  const emojiRegex = /[\p{Emoji}\p{P}]+/gu;

  if (emojiRegex.test(categoryName)){
    return '';
  }

  // If no emoji at the start, map the category name to its corresponding icon
  const cleanedCategoryName = categoryName.trim();
  return iconMap[cleanedCategoryName] || '🍽️'; // Default icon for unknown categories
}

const searchBar = document.getElementById("search-bar");
const clearSearchBtn = document.getElementById("clear-search");

// Search functionality
searchBar.addEventListener("input", handleSearchInput);
clearSearchBtn.addEventListener("click", clearSearch);

// Function to handle search input
function handleSearchInput(e) {
    const query = e.target.value.toLowerCase();

    // Show or hide the clear button based on input
    if (query) {
        clearSearchBtn.classList.remove("hidden");
    } else {
        clearSearchBtn.classList.add("hidden");
    }

    // Filter menu items based on the search query
    renderMenuItems(query);
}

// Function to clear the search input
function clearSearch() {
    searchBar.value = "";
    clearSearchBtn.classList.add("hidden");
    renderMenuItems();  // Reset to all items
}

function renderMenuItems(query = "") {
    let items = menuData.menu_items || [];

    // Filter by category if not "all"
    if (activeCategory !== "all") {
        items = items.filter(item => item.category_details.id.toString() === activeCategory);
    }

    // Filter by search query
    if (query) {
        items = items.filter(item => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query));
    }

    // If no items match, display a "No items found" message
    if (items.length === 0) {
        menuGrid.innerHTML = `<div class="no-items-message">🍜 No items found.</div>`;
    } else {
        // Render filtered items
        menuGrid.innerHTML = items
        .map((item, index) => `
            <div class="menu-item ${!item.is_available ? "unavailable" : ""}"
                style="animation-delay: ${index * 100}ms">
                <div class="menu-item-image" data-item-id="${item.id}">
                    <img src="${item.image_url || 'https://plakarestaurant.ca/wp-content/themes/twentytwentythree-child/img/food-placeholder.png'}" alt="${item.name}" />
                    <div class="image-overlay"></div>
                    ${!item.is_available ? '<div class="unavailable-overlay">Not Available</div>' : ""}
                </div>
                <div class="menu-item-content">
                    <h3 class="menu-item-name">${item.name}</h3>
                    <p class="menu-item-description">${item.description}</p>
                    <div class="menu-item-footer">
                        <span class="menu-item-price">ETB${item.price}</span>
                        ${item.is_available ? 
                          `<button class="add-btn" data-item-id="${item.id}">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <!-- Background Circle (optional, for contrast) -->
                              <circle cx="12" cy="12" r="12" fill="#f7f2e7" fill-opacity="0.8"/>
                              <!-- Bold TK Text -->
                              <text x="12" y="17" font-family="'Roboto', sans-serif" font-size="14" font-weight="900" fill="#5b3a29" text-anchor="middle" dominant-baseline="middle">TK</text>
                            </svg>
                          </button>` : 
                          `<button class="add-btn disabled" disabled>Unavailable</button>`
                        }
                    </div>
                </div>
            </div>
        `)
        .join("");
    }
}

function renderCart() {
  if (cart.length === 0) {
    cartButton.classList.add("hidden")
    return
  }

  cartButton.classList.remove("hidden")
  cartBadge.textContent = getTotalItems()

  cartItems.innerHTML = cart
    .map(
      (item) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <h3>${item.name}</h3>
                <p>ETB${item.price} each</p>
            </div>
            <div class="cart-item-controls">
                <button class="quantity-btn" data-action="decrease" data-item-id="${item.id}">-</button>
                <span class="quantity">${item.quantity}</span>
                <button class="quantity-btn" data-action="increase" data-item-id="${item.id}">+</button>
            </div>
        </div>
    `,
    )
    .join("")

  cartTotalPrice.textContent = `ETB${getTotalPrice()}`
}

// Event listeners
function setupEventListeners() {
  // Category chips
  categoryChips.addEventListener("click", (e) => {
    if (e.target.classList.contains("category-chip")) {
      activeCategory = e.target.dataset.category
      renderCategories()
      renderMenuItems()
    }
  })

  // Menu items
  menuGrid.addEventListener("click", (e) => {
    if (e.target.closest(".menu-item-image")) {
      const itemId = Number.parseInt(e.target.closest(".menu-item-image").dataset.itemId)
      openItemModal(itemId)
      return
    }

    if (e.target.classList.contains("add-btn") && !e.target.disabled) {
      const itemId = Number.parseInt(e.target.dataset.itemId)
      addToCart(itemId)
    }
  })

  // Cart
  cartButton.addEventListener("click", () => {
    cartOverlay.classList.remove("hidden")
  })

  document.getElementById("cart-close-btn").addEventListener("click", () => {
    cartOverlay.classList.add("hidden")
  })

  cartItems.addEventListener("click", (e) => {
    if (e.target.classList.contains("quantity-btn")) {
      const itemId = Number.parseInt(e.target.dataset.itemId)
      const action = e.target.dataset.action

      if (action === "increase") {
        updateQuantity(itemId, 1)
      } else if (action === "decrease") {
        updateQuantity(itemId, -1)
      }
    }
  })

  document.getElementById("item-modal-close").addEventListener("click", () => {
    itemModal.classList.add("hidden")
  })

  itemModalAddBtn.addEventListener("click", () => {
    const itemId = Number.parseInt(itemModalAddBtn.dataset.itemId)
    addToCart(itemId)
    itemModal.classList.add("hidden")
  })

  // Manager modal
  document.getElementById("manager-login-btn").addEventListener("click", handleManagerLogin)
  document.getElementById("manager-cancel-btn").addEventListener("click", () => {
    managerModal.classList.add("hidden")
    managerPassword.value = ""
  })

  managerPassword.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleManagerLogin()
    }
  })

  // Long press for manager access
  document.body.addEventListener("touchstart", handleLongPressStart)
  document.body.addEventListener("touchend", handleLongPressEnd)
  document.body.addEventListener("mousedown", handleLongPressStart)
  document.body.addEventListener("mouseup", handleLongPressEnd)
  document.body.addEventListener("mouseleave", handleLongPressEnd)

  // Place order
  document.getElementById("place-order-btn").addEventListener("click", handlePlaceOrder)

  // Close modals on overlay click
  cartOverlay.addEventListener("click", (e) => {
    if (e.target === cartOverlay) {
      cartOverlay.classList.add("hidden")
    }
  })

  managerModal.addEventListener("click", (e) => {
    if (e.target === managerModal) {
      managerModal.classList.add("hidden")
      managerPassword.value = ""
    }
  })

  itemModal.addEventListener("click", (e) => {
    if (e.target === itemModal) {
      itemModal.classList.add("hidden")
    }
  })
}

async function handlePlaceOrder() {
  if (cart.length === 0) {
    showToast("Your cart is empty!");
    return;
  }

  // if (!currentTableNumber && !currentTableUUID) {
  //   showToast("Please scan a QR code to identify your table first.");
  //   return;
  // }

  const orderData = {
    table_number: currentTableNumber || "Unknown Table",
    items: cart.map(item => ({
      menu_item_id: item.id,
      quantity: item.quantity
    }))
  };

  try {
    const order = await placeOrder(orderData);
    showToast("Order placed successfully! Your order number is #" + order.id, 'success');
    cart = [];
    renderCart();
    cartOverlay.classList.add("hidden");
  } catch (error) {
    showToast("Failed to place order. Please try again.");
    console.error("Order error:", error);
  }
}

function openItemModal(itemId) {
  const item = findItemById(itemId)
  if (!item) return 
  itemModalImg.src = item.image_url || 'https://plakarestaurant.ca/wp-content/themes/twentytwentythree-child/img/food-placeholder.png'
  itemModalImg.alt = item.name
  itemModalName.textContent = item.name
  itemModalDescription.textContent = item.description
  itemModalPrice.textContent = `ETB${item.price}`
  itemModalAddBtn.dataset.itemId = itemId
  itemModalAddBtn.disabled = !item.is_available
  itemModalAddBtn.textContent = item.is_available ? "Add to order" : "Not Available"

  itemModal.classList.remove("hidden")
}

// Helper functions
function addToCart(itemId) {
  const item = findItemById(itemId)
  if (!item || !item.is_available) return

  const existingItem = cart.find((cartItem) => cartItem.id === itemId)
  if (existingItem) {
    existingItem.quantity += 1
  } else {
    cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: 1,
    })
  }

  renderCart()
}

function updateQuantity(itemId, change) {
  const cartItem = cart.find((item) => item.id === itemId)
  if (!cartItem) return

  cartItem.quantity += change

  if (cartItem.quantity <= 0) {
    cart = cart.filter((item) => item.id !== itemId)
  }

  renderCart()
}

function findItemById(itemId) {
  return menuData.menu_items.find((item) => item.id === itemId)
}

function getTotalPrice() {
  return cart.reduce((total, item) => total + item.price * item.quantity, 0)
}

function getTotalItems() {
  return cart.reduce((total, item) => total + item.quantity, 0)
}

async function handleManagerLogin() {
  const password = managerPassword.value;
  
  if (!password) {
    showToast("Please enter a password");
    return;
  }

  try {
    const token = await managerLogin('admin', password);
    localStorage.setItem('managerToken', token);
    isManagerAuthenticated = true;
    managerModal.classList.add("hidden");
    managerBadge.classList.remove("hidden");
    managerPassword.value = "";
    
    // Redirect to manager page
    window.location.href = '/manager';
  } catch (error) {
    showToast("Invalid password");
  }
}

function handleLongPressStart() {
  longPressTimer = setTimeout(() => {
    managerModal.classList.remove("hidden")
    managerPassword.focus()
  }, 2000)
}

function handleLongPressEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

// Add initial body styles for fade-in animation
document.body.style.opacity = "0"
document.body.style.transform = "translateY(20px)"
document.body.style.transition = "opacity 0.5s ease, transform 0.5s ease"