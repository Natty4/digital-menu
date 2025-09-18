class ManagerDashboard {
    constructor() {
        this.authToken = localStorage.getItem('managerToken');
        this.isAuthenticated = false;
        this.currentSection = "menu";
        this.menuItems = [];
        this.categories = [];
        this.orders = [];
        this.logoSrc = null;
        this.editingItemId = null;
        this.editingCategoryId = null;
        this.activeRequests = 0;
        this.isSaving = false;
        
        this.init();
    }

    init() {
        this.setupLoginModal();
        
        // Check if we have a token and verify it
        if (this.authToken) {
            this.verifyToken();
        } else {
            this.showLoginModal();
        }
    }


    initializeDashboard() {
        // Only initialize the dashboard if authenticated
        if (!this.isAuthenticated) return;
        
        this.setupNavigation();
        this.setupMenuManagement();
        this.setupCategoryManagement();
        this.setupQRGenerator();
        this.setupOrderManagement();
        this.fetchMenuItems();
        this.fetchCategories();
        this.fetchOrders();
        this.updateStats();
        this.fetchQRCodeList();

        if (this.currentSection === 'analytics') {
            this.analyticsManager = new AnalyticsManager(this);
            this.analyticsManager.setupAnalytics();
        }
    }


    // Function to get the CSRF token from cookies
    getCSRFToken() {
      const name = 'csrftoken=';
      const value = document.cookie.split(';').find(row => row.startsWith(name));
      if (value) {
        return value.split('=')[1];
      }
      return '';
    }

    setupLoginModal() {
        // Login button event
        document.getElementById('manager-login-btn').addEventListener('click', () => {
            this.handleLogin();
        });

        // Cancel button event - redirect to home page
        document.getElementById('manager-cancel-btn').addEventListener('click', () => {
            window.location.href = '/';
        });

        // Allow login on Enter key
        const passwordInput = document.getElementById('manager-password');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });
        }
    }   

    showError(message) {
        const errorElement = document.getElementById('login-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        }
    }
    
    showLoginModal() {
        const loginModal = document.getElementById('manager-login-modal');
        const managerContent = document.getElementById('manager-content');
        
        if (loginModal) loginModal.classList.remove('hidden');
        if (managerContent) managerContent.classList.add('hidden');
        
        // Focus on password field
        const usernameInput = document.getElementById('manager-username');
        if (usernameInput) usernameInput.focus();

    }

    hideLoginModal() {
        const loginModal = document.getElementById('manager-login-modal');
        if (loginModal) loginModal.classList.add('hidden');
    }

    showManagerContent() {
        const managerContent = document.getElementById('manager-content');
        if (managerContent) managerContent.classList.remove('hidden');
    }

  // Function to show toaster messages
  showToast(message, type = 'error') {
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
      }, 6000); // After 6s, hide the container and remove toast
  }


  // Show loading indicator
  showLoading() {
      document.getElementById('loading-overlay').classList.remove('hidden');
  }

  // Hide loading indicator
  hideLoading() {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      if (this.activeRequests === 0) {
          document.getElementById('loading-overlay').classList.add('hidden');
      }
  }

  
  // API Functions
  async apiCall(endpoint, options = {}, requireAuth = true) {
        this.activeRequests++;
        this.showLoading();

        const defaultOptions = {
            headers: {}
        };
        // Only add Authorization header for authenticated endpoints
        if (requireAuth && this.authToken) {
            defaultOptions.headers['Authorization'] = `Token ${this.authToken}`;
        }

        if (options.method === 'POST') {
            defaultOptions.headers['X-CSRFToken'] = this.getCSRFToken();
        }
        // Set Content-Type for non-FormData requests
        if (!(options.body instanceof FormData)) {
            defaultOptions.headers['Content-Type'] = 'application/json';
        }

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, finalOptions);

            if (response.status === 401) {
                localStorage.removeItem('managerToken');
                this.authToken = null;
                this.isAuthenticated = false;
                this.showLoginModal();
                this.showToast('Session expired. Please log in again.', 'error');
                return null;
            }

            if (response.status === 204) {
                return { status: 204 };
            }

            const data = await response.json();

            if (!response.ok) {
                console.error('API response:', data);
                this.showToast(data?.detail || data?.error || `API error: ${response.status}`, 'error');
                throw new Error(data?.detail || data?.error || `API error: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        } finally {
            this.activeRequests--;
            if (this.activeRequests === 0) {
                this.hideLoading();
            }
        }
    }

  async verifyToken() {
      if (!this.authToken) {
          this.isAuthenticated = false;
          this.showLoginModal();
          return;
      }

      try {
          const data = await this.apiCall('/menu_items/', { method: 'GET' });
          if (data) {
              this.isAuthenticated = true;
              this.hideLoginModal();
              this.showManagerContent();
              this.initializeDashboard();
          } else {
              // Token invalid or API call failed
              localStorage.removeItem('managerToken');
              this.authToken = null;
              this.isAuthenticated = false;
              this.showLoginModal();
          }
      } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('managerToken');
          this.authToken = null;
          this.isAuthenticated = false;
          this.showLoginModal();
          this.showToast('Invalid or expired token. Please log in again.', 'error');
      }
  }

  async handleLogin() {
      const usernameInput = document.getElementById('manager-username');
      const passwordInput = document.getElementById('manager-password');
      const username = usernameInput?.value;
      const password = passwordInput?.value;

      // Validate inputs
      if (!username || !password) {
          this.showToast('Please enter both username and password', 'error');
          return;
      }

      try {
          // Clear any existing token to prevent duplicates
          localStorage.removeItem('managerToken');
          this.authToken = null;
          this.isAuthenticated = false;

          const data = await this.apiCall('/manager/login/', {
              method: 'POST',
              body: JSON.stringify({ username, password })
          }, false); // No auth required for login

          if (!data) {
              // apiCall already handled errors with toasts
              return;
          }

          // Login successful
          this.authToken = data.token;
          localStorage.setItem('managerToken', this.authToken);
          document.cookie = `manager_token=${this.authToken}; path=/; SameSite=Lax; Secure`;
          this.isAuthenticated = true;

          // Update UI
          try {
              this.hideLoginModal();
              this.showManagerContent();
              this.initializeDashboard();
              this.showToast('Login successful.', 'success');
          } catch (uiError) {
              console.error('UI update failed after login:', uiError);
              this.showToast('Login successful, but UI update failed. Please refresh the page.', 'warning');
          }

          // Clear input fields
          if (usernameInput) usernameInput.value = '';
          if (passwordInput) passwordInput.value = '';
      } catch (error) {
          console.error('Login error:', error);
          // apiCall already shows error toasts
      }
  }

  async logout() {
      try {
          const data = await this.apiCall('/manager/logout/', {
              method: 'POST'
          });
          if (data) {
              this.showToast('Successfully logged out.', 'success');
          }
      } catch (error) {
          console.error('Logout API call failed:', error);
        
      }

      // Perform client-side cleanup
      localStorage.removeItem('managerToken');
      this.authToken = null;
      this.isAuthenticated = false;

      // Update UI
      try {
          this.hideManagerContent();
          this.showLoginModal();
      } catch (uiError) {
          console.error('UI update failed during logout:', uiError);
          this.showToast('Logout successful, but UI update failed. Please refresh the page.', 'warning');
      }
  }
    
//   async fetchMenuItems() {
//       try {
//           const data = await this.apiCall('/menu_items/');
//           if (data) {
//               this.menuItems = data.results || data;
//               this.renderMenuTable();
//           }
//       } catch (error) {
//           console.error('Failed to fetch menu items:', error);
//           this.showToast('Failed to refresh menu. Please try again.');
//       }
//   }

async fetchMenuItems() {
  try {
    const data = await this.apiCall('/menu_items/');
    if (data) {
      this.menuItems = data.results || data;
      this.renderMenuItems();
    }
  } catch (error) {
    this.showToast('Failed to load menu items.');
  }
}

//   async fetchCategories() {
//     const data = await this.apiCall('/categories/')
//     if (data) {
//       this.categories = data.results || data
//       this.renderCategoryTable()
//     }
//   }

async fetchCategories() {
  const data = await this.apiCall('/categories/');
  if (data) {
    this.categories = data.results || data;
    this.renderCategoryTabs();
  }
}

  async fetchOrders() {
    const data = await this.apiCall('/orders/')
    if (data) {
      this.orders = data.results || data
      this.renderOrders()
      this.updateStats()
    }
  }

  async saveMenuItem(itemData) {
    if (this.isSaving) {
        console.log('Save in progress, ignoring request');
        return;
    }
    this.isSaving = true;

    // Validate itemData
    const requiredFields = ['name', 'price', 'category', 'description', 'is_available'];
    for (const field of requiredFields) {
        if (itemData[field] === undefined || itemData[field] === null) {
            const errorMsg = `Missing required field: ${field}`;
            console.error(errorMsg);
            this.showToast(errorMsg);
            this.isSaving = false;
            return;
        }
    }

    // Ensure category is a valid ID
    if (typeof itemData.category === 'object' && itemData.category?.id) {
        itemData.category = itemData.category.id;
    }

    const formData = new FormData();
    Object.keys(itemData).forEach(key => {
        if (key === 'image' && itemData[key] instanceof File) {
            formData.append('image', itemData[key]);
        } else if (key !== 'image') {
            formData.append(key, itemData[key]);
        }
    });

    let endpoint = '/menu_items/';
    let method = 'POST';

    if (this.editingItemId) {
        endpoint = `/menu_items/${this.editingItemId}/`;
        method = 'PUT';
    }

    const options = {
        method: method,
        headers: {
            'Authorization': `Token ${this.authToken}`,
        },
        body: formData
    };

    try {
        const data = await this.apiCall(endpoint, options);
        if (!data) {
            // apiCall already showed a toast for errors (e.g., 401)
            return;
        }

        // Item saved successfully
        this.showToast('Menu item saved successfully.', 'success');

        // Perform post-save actions in a separate try-catch
        try {
            await this.fetchMenuItems();
            this.clearMenuItemModal();
            const modal = document.getElementById("menu-item-modal");
            if (modal) {
                modal.classList.add("hidden");
            } else {
                console.warn('Menu item modal not found');
            }
        } catch (postSaveError) {
            console.error('Post-save error:', postSaveError);
            this.showToast('Item saved, but failed to refresh or close modal. Please refresh the page.');
        }

        return data;
    } finally {
        this.isSaving = false;
    }
  }

  clearMenuItemModal() {
    // Clear all fields in the modal
    const modal = document.getElementById('menu-item-modal');
    if (modal) {
      document.getElementById('item-name-input').value = '';
      document.getElementById('item-price-input').value = '';
      document.getElementById('item-description-input').value = '';
      document.getElementById('item-category-input').value = '';
      document.getElementById('item-image-input').value = ''; // Optional: Reset image input
      document.getElementById('item-image-preview').classList.add('hidden'); // Hide image preview
      document.getElementById('item-available-input').checked = true; // Reset "available" checkbox if needed
    }
  }


  async saveCategory(categoryData) {
    let endpoint = '/categories/'
    let method = 'POST'
    
    if (this.editingCategoryId) {
      endpoint = `/categories/${this.editingCategoryId}/`
      method = 'PUT'
    }
    
    const data = await this.apiCall(endpoint, {
      method: method,
      body: JSON.stringify(categoryData)
    })
    
    if (data) {
      await this.fetchCategories() // Refresh the list
      document.getElementById("category-modal").classList.add("hidden")
      this.showToast('Category saved successfully.', 'success')
    }
  }

   // Show custom confirmation modal
  showConfirmationModal(message, onConfirm) {
      const modal = document.getElementById("confirmation-modal");
      const messageElement = document.getElementById("confirmation-message");
      const confirmBtn = document.getElementById("confirm-btn");
      const cancelBtn = document.getElementById("cancel-btn");

      // Set the confirmation message
      messageElement.textContent = message;

      // Show the modal
      modal.classList.remove("hidden");

      // When "Yes" is clicked
      confirmBtn.onclick = () => {
        onConfirm();
        modal.classList.add("hidden");
      };

      // When "No" is clicked
      cancelBtn.onclick = () => {
        modal.classList.add("hidden");
      };
    }

  async deleteItem(itemId) {
      this.showConfirmationModal(
        "Are you sure you want to delete this item?", 
        async () => {
          const response = await this.apiCall(`/menu_items/${itemId}/`, {
            method: 'DELETE'
          });

          // Check if the response is valid (status 204)
          if (response && response.status === 204) { // Success: No content returned
            await this.fetchMenuItems();
            this.showToast('Menu item deleted successfully.', 'success');
          } else {
            console.error('Error deleting menu item:', response);
            this.showToast('There was a problem with the request.');
          }
        }
      );
  }

  async deleteCategory(catId) {
      this.showConfirmationModal(
        "Are you sure you want to delete this category? Items in this category will be unaffected.", 
        async () => {
          const response = await this.apiCall(`/categories/${catId}/`, {
            method: 'DELETE'
          });

          // Check if the response is valid (status 204)
          if (response && response.status === 204) { // Success: No content returned
            await this.fetchCategories();
            this.showToast('Category deleted successfully.', 'success');
          } else {
            console.error('Error deleting category:', response);
            this.showToast('There was a problem with the request.');
          }
        }
      );
  }

 async toggleAvailability(itemId) {
  const item = this.menuItems.find((i) => i.id === itemId);
  
  if (item) {
    // Only send the is_available field
    const updatedData = {
      is_available: !item.is_available  // Toggle the availability
    };

    // Send a PATCH request to update just the is_available field
    const data = await this.apiCall(`/menu_items/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify(updatedData),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${this.authToken}`
      },
    });

    if (data) {
      await this.fetchMenuItems();  // Refresh the menu items list
    }
  }
}

  async updateOrderStatus(orderId, newStatus) {
    const data = await this.apiCall(`/orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    })
    
    if (data) {
      await this.fetchOrders()
      this.updateStats()
    }
  }

  async generateQRCode() {
    const tableNumber = document.getElementById("table-number").value;
    const qrColor = document.getElementById("qr-color").value;
    const logoFile = document.getElementById("logo-upload").files[0];

    if (!tableNumber) {
        this.showToast('Please enter a table number/name', 'error');
        return;
    }

    // Validate logo file type and size
    if (logoFile) {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!validTypes.includes(logoFile.type)) {
            this.showToast('Logo must be a PNG or JPEG image.', 'error');
            return;
        }
        if (logoFile.size > 1_000_000) { // Max 1MB
            this.showToast('Logo file size must be less than 1MB.', 'error');
            return;
        }
    }

    const formData = new FormData();
    formData.append('table_number', tableNumber);
    formData.append('qr_color', qrColor);

    if (logoFile) {
        formData.append('logo', logoFile);
    }

    const options = {
        method: 'POST',
        headers: {
            'Authorization': `Token ${this.authToken}`
        },
        body: formData
    };

    // Remove Content-Type header for FormData
    delete options.headers['Content-Type'];

    try {
        const data = await this.apiCall('/qr_codes/generate/', options);

        if (data) {
            // Show success message
            this.showToast(`QR code generated successfully for ${tableNumber}!`, 'success');
            this.fetchQRCodeList();

            // Reset form
            document.getElementById("table-number").value = "";
            document.getElementById("logo-upload").value = "";
            document.getElementById("logo-preview").classList.add("hidden");
            this.logoSrc = null;
            this.updateQRPreview();
        }
    } catch (error) {
        console.error("Error generating QR Code:", error);
        this.showToast("Failed to generate QR code. Please try again.", "error");
    }
}

  // Fetch generated QR codes from the API and display them
  async fetchQRCodeList() {
      try {
          const data = await this.apiCall('/qr_codes/');
          if (data) {
              this.displayQRCodeList(data);  // Display the list of QR codes
          } else {
              this.showToast('Failed to fetch QR codes: No data received');
          }
      } catch (error) {
          console.error('Failed to fetch QR codes:', error);
          this.showToast(`Failed to fetch QR codes: ${error.message}`);
      }
  }

  // Function to display the list of QR codes
  displayQRCodeList(qrCodes) {
      const qrCodesList = document.getElementById('qr-codes-list');
      qrCodesList.innerHTML = '';  // Clear previous list

      qrCodes.forEach(qr => {
          const qrDiv = document.createElement('div');
          qrDiv.classList.add('qr-item');
          qrDiv.innerHTML = `
              <div class="qr-item-content">
                  <h4>${qr.table_number}</h4>
                  <img src="${qr.qr_code_url}" alt="QR Code for Table ${qr.table_number}" class="qr-image" />
                  <button class="btn-download"><i class="fas fa-download"></i> Download</button>
                  <button class="btn-print"><i class="fas fa-print"></i> Print</button>
              </div>
          `;
          
          // Add the buttons and set up the event listeners
          const downloadButton = qrDiv.querySelector('.btn-download');
          const printButton = qrDiv.querySelector('.btn-print');
          
          // Attach the event listeners
          downloadButton.addEventListener('click', () => this.downloadQRCode(qr.qr_code_url));
          printButton.addEventListener('click', () => this.printQRCode(qr.qr_code_url));
          
          qrCodesList.appendChild(qrDiv);
      });
  }

  // Function to download a QR code
  downloadQRCode(url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'qr_code.png';  // Set the download file name
      link.click();
  }

  // Function to print a QR code
  printQRCode(url) {
      const imgWindow = window.open(url, '_blank');
      imgWindow.print();
  }


  hideManagerContent() {
      const managerContent = document.getElementById('manager-content');
      if (managerContent) managerContent.classList.add('hidden');
  }

  // Update setupNavigation to include logout
  setupNavigation() {
    const navItems = document.querySelectorAll(".nav-item");
    const sections = document.querySelectorAll(".manager-section");

    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            const sectionName = item.dataset.section;

            // Update nav UI
            navItems.forEach((nav) => nav.classList.remove("active"));
            item.classList.add("active");

            // Update section visibility
            sections.forEach((section) => section.classList.remove("active"));
            document.getElementById(`${sectionName}-section`).classList.add("active");

            this.currentSection = sectionName;

            // Analytics
            if (sectionName === 'analytics') {
                this.analyticsManager = new AnalyticsManager(this);
                this.analyticsManager.setupAnalytics();
            }

            // Orders section logic
            if (sectionName === 'orders') {
                this.fetchOrders();
                this.setupOrderManagement(); // Start auto-refresh
            } else {
                // Stop auto-refresh when leaving orders section
                if (this._stopOrderInterval) {
                    this._stopOrderInterval();
                }
            }
        });
    });

    // Back to menu button
    const backButton = document.getElementById("back-to-menu");
    if (backButton) {
        backButton.addEventListener("click", () => {
            window.location.href = "/";
        });
    }

    // Logout button
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            this.logout();
        });
    }
}

//   renderMenuTable() {
//     const tbody = document.getElementById("menu-table-body")
//     tbody.innerHTML = ""

//     this.menuItems.forEach((item) => {
//       const row = document.createElement("tr")
//       row.innerHTML = `
//                 <td>
//                     <div class="item-info">
//                         <div class="item-thumbnail">
//                             <img src="${item.image_url || 'https://plakarestaurant.ca/wp-content/themes/twentytwentythree-child/img/food-placeholder.png'}" alt="${item.name}" />
//                         </div>
//                         <div class="item-details">
//                             <h4>${item.name}</h4>
//                             <p>${item.description}</p>
//                         </div>
//                     </div>
//                 </td>
//                 <td>ETB${item.price}</td>
//                 <td>${item.category_details ? item.category_details.name : 'Uncategorized'}</td>
//                 <td>
//                     <div class="availability-toggle">
//                         <div class="toggle-switch ${item.is_available ? "active" : ""}" 
//                              onclick="manager.toggleAvailability(${item.id})">
//                         </div>
//                         <span>${item.is_available ? "Available" : "Unavailable"}</span>
//                     </div>
//                 </td>
//                 <td>
//                     <div class="action-buttons">
//                         <button class="btn btn-sm btn-outline" onclick="manager.editItem(${item.id})">
//                             Edit
//                         </button>
//                         <button class="btn btn-sm btn-outline danger" onclick="manager.deleteItem(${item.id})">
//                             Delete
//                         </button>
//                     </div>
//                 </td>
//             `
//       tbody.appendChild(row)
//     })
//   }

  renderMenuItems(activeCategory = "all") {
    const container = document.getElementById("menu-items-list");
    container.innerHTML = "";

    const filtered = activeCategory === "all"
        ? this.menuItems
        : this.menuItems.filter(i => i.category_details?.id == activeCategory);

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "menu-item-card";

        card.innerHTML = `
        <img src="${item.image_url || 'https://plakarestaurant.ca/wp-content/themes/twentytwentythree-child/img/food-placeholder.png'}" alt="${item.name}" />
        <div class="menu-item-info">
            <h4>${item.name}</h4>
            <p>${item.description || ""}</p>
            <strong>ETB${item.price}</strong>
            <div class="availability">
            ${item.is_available ? "Available" : "Unavailable"}
            </div>
        </div>
        <div class="menu-item-actions">
            <i class="fas fa-edit" title="Edit" onclick="manager.editItem(${item.id})"></i>
            <i class="fas fa-trash" title="Delete" onclick="manager.deleteItem(${item.id})"></i>
        </div>
        `;
        container.appendChild(card);
    });

    // Dynamic "Add Item" card
    const addCard = document.createElement("div");
    addCard.className = "add-item-card";

    let categoryName = "All";
    if (activeCategory !== "all") {
        const cat = this.categories.find(c => c.id == activeCategory);
        if (cat) categoryName = cat.name;
    }

    addCard.textContent = `+ Add Item for ${categoryName}`;
    // addCard.onclick = () => document.getElementById("add-menu-item").click();
    addCard.onclick = () => {
        const catId = activeCategory !== "all" ? activeCategory : null
        this.openItemModal(null, catId)
        }

    container.appendChild(addCard);
    }

//   renderCategoryTable() {
//     const tbody = document.getElementById("category-table-body")
//     tbody.innerHTML = ""

//     this.categories.forEach((cat) => {
//       const row = document.createElement("tr")
//       row.innerHTML = `
//                 <td>${cat.name}</td>
//                 <td>
//                     <div class="action-buttons">
//                         <button class="btn btn-sm btn-outline" onclick="manager.editCategory('${cat.id}')">
//                             Edit
//                         </button>
//                         <button class="btn btn-sm btn-outline danger" onclick="manager.deleteCategory('${cat.id}')">
//                             Delete
//                         </button>
//                     </div>
//                 </td>
//             `
//       tbody.appendChild(row)
//     })
//   }

 renderCategoryTabs() {
    const container = document.getElementById("category-tabs-container");
    container.innerHTML = "";

    // Count items per category
    const counts = {};
    this.categories.forEach(cat => {
        counts[cat.id] = this.menuItems.filter(i => i.category_details?.id == cat.id).length;
    });

    // "All" tab
    const allBtn = document.createElement("div");
    allBtn.className = "category-tab active";
    allBtn.dataset.category = "all";
    allBtn.textContent = `All (${this.menuItems.length})`;
    allBtn.addEventListener("click", () => {
        document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
        allBtn.classList.add("active");
        this.renderMenuItems("all");
        // Hide any open dropdowns
        document.querySelectorAll(".category-more-menu").forEach(d => d.classList.add("hidden"));
    });
    container.appendChild(allBtn);

    // Each category
    this.categories.forEach(cat => {
        const wrapper = document.createElement("div");
        wrapper.className = "category-tab";
        wrapper.dataset.category = cat.id;

        const nameSpan = document.createElement("span");
        nameSpan.textContent = `${cat.name} (${counts[cat.id] || 0})`;

        const moreBtn = document.createElement("span");
        moreBtn.className = "category-more";
        moreBtn.innerHTML = `<i class="fas fa-ellipsis-v"></i>`;

        // Dropdown menu hidden by default
        const dropdown = document.createElement("div");
        dropdown.className = "category-more-menu hidden";
        dropdown.innerHTML = `
            <div class="menu-item" onclick="manager.editCategory('${cat.id}')"><i class="fas fa-edit" title="Edit"></i> Edit</div>
            <div class="menu-item" onclick="manager.deleteCategory('${cat.id}')"><i class="fas fa-trash" title="Delete"></i> Delete</div>
        `;
        moreBtn.appendChild(dropdown);

        // Toggle dropdown on click
        moreBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            // Hide all other dropdowns first
            document.querySelectorAll(".category-more-menu").forEach(d => {
                if (d !== dropdown) d.classList.add("hidden");
            });
            dropdown.classList.toggle("hidden");
        });

        wrapper.appendChild(nameSpan);
        wrapper.appendChild(moreBtn);

        wrapper.addEventListener("click", () => {
            document.querySelectorAll(".category-tab").forEach(t => t.classList.remove("active"));
            wrapper.classList.add("active");
            this.renderMenuItems(cat.id);
            // Hide any open dropdowns
            document.querySelectorAll(".category-more-menu").forEach(d => d.classList.add("hidden"));
        });

        container.appendChild(wrapper);
    });

    // Floating "+" tab
    const addTab = document.createElement("div");
    addTab.className = "category-tab add-tab";
    addTab.textContent = "+";
    addTab.title = "Add Category";
    addTab.onclick = () => this.openCategoryModal();
    container.appendChild(addTab);

    // Click anywhere outside to close dropdowns
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".category-more")) {
            document.querySelectorAll(".category-more-menu").forEach(d => d.classList.add("hidden"));
        }
    });

    // Default to All
    this.renderMenuItems("all");
}

  renderOrders() {
            const container = document.getElementById("orders-container")
            container.innerHTML = ""

            this.orders.forEach((order) => {
              const orderCard = document.createElement("div")
              orderCard.className = `order-card ${order.status}`
              
              // Format the timestamp to a readable format (assuming it's a valid date string)
              const createdAt = new Date(order.created_at);
              const timestamp = createdAt.toLocaleString(); // Adjust formatting as needed
              
              orderCard.innerHTML = `
                <div class="order-header">
                  <div class="order-table-number">${order.table_number}</div>
                  <div class="order-status ${order.status}">${order.status.replace("_", " ")}</div>
                </div>
                <div class="order-items">
                  ${order.items
                    .map(
                      (item) => `
                      <div class="order-item">
                          <span class="order-item-name">${item.quantity}x ${item.menu_item_name}</span>
                          <span class="order-item-price">ETB${(item.price_at_order * item.quantity).toFixed(2)}</span>
                      </div>
                  `,
                    )
                    .join("")}
                </div>
                <div class="order-total">
                  <span>Total</span>
                  <span>ETB${order.total_price}</span>
                </div>
                <div class="order-actions">
                    ${order.status === 'pending' || order.status === 'new' ? `
                    <button class="btn btn-sm  success" onclick="manager.updateOrderStatus(${order.id}, 'in_progress')">
                        <i class="fas fa-play"></i> Start Preparing
                    </button>
                    ` : ''}
                    ${order.status === 'in_progress' ? `
                    <button class="btn btn-sm btn-primary " onclick="manager.updateOrderStatus(${order.id}, 'completed')">
                        <i class="fas fa-check"></i> Mark Complete
                    </button>
                    ` : ''}
                    ${order.status === 'new' || order.status === 'pending' || order.status === 'in_progress' ? `
                    <button class="btn btn-sm btn-outline danger" onclick="manager.updateOrderStatus(${order.id}, 'cancelled')">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                    ` : ''}
                    ${order.status === 'completed' || order.status === 'cancelled' ? `
                    <button class="btn btn-sm btn-outline danger-2" onclick="manager.updateOrderStatus(${order.id}, 'archived')">
                       <i class="fas fa-trash"></i> Archive
                    </button>
                    ` : ''}
                </div>
                <div class="order-timestamp">ordered on: ${timestamp}</div>
            `
      container.appendChild(orderCard)
    })
  }

//   openItemModal(item = null) {
//     const modal = document.getElementById("menu-item-modal")
//     const title = document.getElementById("menu-item-modal-title")
//     const select = document.getElementById("item-category-input")
//     const preview = document.getElementById("item-image-preview")
//     const previewImg = document.getElementById("item-preview-img")

//     // Populate categories
//     select.innerHTML = this.categories.map(cat => `
//         <option value="${cat.id}">${cat.name}</option>
//     `).join('')

//     this.editingItemId = null

//     if (item) {
//       title.textContent = "Edit Item"
//       document.getElementById("item-name-input").value = item.name
//       document.getElementById("item-price-input").value = item.price
//       document.getElementById("item-description-input").value = item.description
//       select.value = item.category_details ? item.category_details.id : ""
//       document.getElementById("item-available-input").checked = item.is_available
//       previewImg.src = item.image_url
//       preview.classList.remove("hidden")
//       this.editingItemId = item.id
//     } else {
//       title.textContent = "Add New Item"
//       document.getElementById("item-name-input").value = ""
//       document.getElementById("item-price-input").value = ""
//       document.getElementById("item-description-input").value = ""
//       select.value = this.categories[0]?.id || ""
//       document.getElementById("item-available-input").checked = true
//       preview.classList.add("hidden")
//     } 
//     modal.classList.remove("hidden")
//   }

    openItemModal(item = null, categoryId = null) {
        const modal = document.getElementById("menu-item-modal")
        const title = document.getElementById("menu-item-modal-title")
        const select = document.getElementById("item-category-input")
        const preview = document.getElementById("item-image-preview")
        const previewImg = document.getElementById("item-preview-img")

        // Populate categories
        select.innerHTML = this.categories.map(cat => `
            <option value="${cat.id}">${cat.name}</option>
        `).join('')

        this.editingItemId = null

        if (item) {
            title.textContent = "Edit Item"
            document.getElementById("item-name-input").value = item.name
            document.getElementById("item-price-input").value = item.price
            document.getElementById("item-description-input").value = item.description
            select.value = item.category_details ? item.category_details.id : ""
            document.getElementById("item-available-input").checked = item.is_available
            previewImg.src = item.image_url
            preview.classList.remove("hidden")
            this.editingItemId = item.id
        } else {
            title.textContent = "Add New Item"
            document.getElementById("item-name-input").value = ""
            document.getElementById("item-price-input").value = ""
            document.getElementById("item-description-input").value = ""
            
            // Preselect category
            if (categoryId) {
            select.value = categoryId
            } else {
            select.value = this.categories[0]?.id || ""
            }

            document.getElementById("item-available-input").checked = true
            preview.classList.add("hidden")
        } 
        modal.classList.remove("hidden")
        }

  handleItemImageUpload(event) {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const preview = document.getElementById("item-image-preview")
        const img = document.getElementById("item-preview-img")
        img.src = e.target.result
        preview.classList.remove("hidden")
      }
      reader.readAsDataURL(file)
    }
  }

  validateImage(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    
    if (file.size > maxSize) {
        throw new Error('Image size must be less than 5MB');
    }
    
    if (!allowedTypes.includes(file.type)) {
        throw new Error('Please upload a JPEG, PNG, or WebP image');
    }
    
    return true;
  }

  // Update the handleSaveMenuItemForm method
  handleSaveMenuItemForm() {
      const name = document.getElementById("item-name-input").value;
      const price = Number.parseFloat(document.getElementById("item-price-input").value);
      const description = document.getElementById("item-description-input").value;
      const categoryId = document.getElementById("item-category-input").value;
      const available = document.getElementById("item-available-input").checked;
      const fileInput = document.getElementById("item-image-input");

      // Validate fields
      if (!name || !price || !categoryId) {
          this.showToast("Please fill in all required fields");
          return;
      }

      const itemData = {
          name,
          price,
          description,
          category: categoryId,
          is_available: available
      };

      // Add image file if selected
      if (fileInput.files[0]) {
          try {
              this.validateImage(fileInput.files[0]);
              itemData.image = fileInput.files[0];
          } catch (error) {
              this.showToast(error.message);
              return;
          }
      }

      this.saveMenuItem(itemData);
  }

  openCategoryModal(cat = null) {
    const modal = document.getElementById("category-modal")
    const title = document.getElementById("category-modal-title")

    this.editingCategoryId = null

    if (cat) {
      title.textContent = "Edit Category"
      document.getElementById("category-name-input").value = cat.name
      this.editingCategoryId = cat.id
    } else {
      title.textContent = "Add New Category"
      document.getElementById("category-name-input").value = ""
    } 
    modal.classList.remove("hidden")
  }

  handleSaveCategory() {
    const name = document.getElementById("category-name-input").value

    if (!name) {
      showToast("Please enter category name")
      return
    }

    this.saveCategory({ name })
  }

  editItem(itemId) {
    const item = this.menuItems.find((i) => i.id === itemId)
    if (item) {
      this.openItemModal(item)
    }
  }

  editCategory(catId) {
    const cat = this.categories.find((c) => c.id == catId)
    if (cat) {
      this.openCategoryModal(cat)
    }
  }

  updateStats() {
    const today = new Date().toDateString()
    const todayOrders = this.orders.filter((order) => {
      const orderDate = new Date(order.updated_at).toDateString()
      return orderDate === today && order.status !== 'cancelled' || order.status === 'archived'
    })

    const dailySales = todayOrders.reduce((sum, order) => sum + parseFloat(order.total_price), 0)
    const activeOrders = this.orders.filter((order) => 
      order.status === 'pending' || order.status === 'in_progress' || order.status === 'new'
    ).length

    document.getElementById("active-orders-count").textContent = activeOrders
    document.getElementById("todays-revenue").textContent = `ETB${dailySales.toFixed(2)}`
  }

  // QR Code generation preview (client-side only for preview)
  updateQRPreview() {
    const tableNumber = document.getElementById("table-number").value || "Table 1";
    const color = document.getElementById("qr-color").value;
    const canvas = document.getElementById("qr-canvas");
    const ctx = canvas.getContext("2d");

    // Get the logo image element
    const logoImage = document.getElementById("logo-img");

    // For preview only - actual QR is generated on server
    const url = `${window.location.origin}/?table_uuid=preview`;

    // Generate QR code and draw it on the canvas
    QRCode.toCanvas(canvas, url, {
      width: 300,
      color: {
        dark: color,
        light: "#FFFFFF",
      },
      errorCorrectionLevel: 'H'
    }, (error) => {
      if (error) {
        console.error(error);
      } else {
        // After the QR code is generated, overlay the logo on it
        if (logoImage.src) {
          const logoSize = Math.min(canvas.width, canvas.height) / 4; // Logo size (quarter of QR code size)
          const logoX = (canvas.width - logoSize) / 2; // Center the logo horizontally
          const logoY = (canvas.height - logoSize) / 2; // Center the logo vertically

          // Draw the logo in the center of the canvas
          logoImage.onload = () => {
            ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);

          };
        }
      }
    });
  }

  handleLogoUpload(event) {
    const file = event.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const preview = document.getElementById("logo-preview")
        const img = document.getElementById("logo-img")
        img.src = e.target.result
        preview.classList.remove("hidden")
        this.logoSrc = e.target.result
      }
      reader.readAsDataURL(file)
    }
  }

  // Setup methods for other components
  setupMenuManagement() {
    // const addItemBtn = document.getElementById("add-menu-item")
    const modal = document.getElementById("menu-item-modal")
    const closeBtn = document.getElementById("menu-item-modal-close")
    const saveBtn = document.getElementById("save-menu-item")
    const cancelBtn = document.getElementById("cancel-menu-item")
    const imageInput = document.getElementById("item-image-input")

    // addItemBtn.addEventListener("click", () => {
    //   this.openItemModal()
    // })

    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden")
    })

    cancelBtn.addEventListener("click", () => {
      modal.classList.add("hidden")
    })

    saveBtn.addEventListener("click", () => {
      this.handleSaveMenuItemForm()
    })

    imageInput.addEventListener("change", (e) => {
      this.handleItemImageUpload(e)
    })
  }

  setupCategoryManagement() {
    const addCategoryBtn = document.getElementById("add-category-btn")
    const modal = document.getElementById("category-modal")
    const closeBtn = document.getElementById("category-modal-close")
    const saveBtn = document.getElementById("save-category")
    const cancelBtn = document.getElementById("cancel-category")



    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden")
    })

    cancelBtn.addEventListener("click", () => {
      modal.classList.add("hidden")
    })

    saveBtn.addEventListener("click", () => {
      this.handleSaveCategory()
    })
  }

  setupQRGenerator() {
    const generateBtn = document.getElementById("generate-qr")
    const tableInput = document.getElementById("table-number")
    const logoUpload = document.getElementById("logo-upload")
    const colorInput = document.getElementById("qr-color")

    generateBtn.addEventListener("click", () => {
      this.generateQRCode()
    })

    // Update preview when inputs change
    ;[tableInput, colorInput].forEach((input) => {
      input.addEventListener("input", () => {
        this.updateQRPreview()
      })
    })

    logoUpload.addEventListener("change", (e) => {
      this.handleLogoUpload(e)
    })

    // Initial preview
    this.updateQRPreview()
  }

  setupOrderManagement() {
    const startInterval = () => {
        if (this.orderRefreshInterval) return; // Prevent multiple intervals

          this.orderRefreshInterval = setInterval(() => {
              if (this.currentSection === 'orders' && !document.hidden) {
                  this.fetchOrders();
              }
          }, 30000); // Every 30 seconds
      };

      const stopInterval = () => {
          if (this.orderRefreshInterval) {
              clearInterval(this.orderRefreshInterval);
              this.orderRefreshInterval = null;
          }
      };

      // Save functions so we can use them in event listeners or elsewhere
      this._startOrderInterval = startInterval;
      this._stopOrderInterval = stopInterval;

      // Start interval if currently in the orders section
      if (this.currentSection === 'orders') {
          startInterval();
      }

      // Set up visibility change handler once
      if (!this._hasVisibilityHandler) {
          document.addEventListener('visibilitychange', () => {
              if (this.currentSection === 'orders') {
                  if (document.hidden) {
                      stopInterval();
                  } else {
                      startInterval();
                  }
              }
          });
          this._hasVisibilityHandler = true;
      }
  }
}

// Analytics functionality
class AnalyticsManager {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.visitorPage = 1;
        this.activityPage = 1;
        this.perPage = 20;
        this.charts = {};
    }

    setupAnalytics() {
        this.setupTabNavigation();
        this.setupEventListeners();
        this.loadAnalyticsSummary();
        // this.loadVisitorLogs();
        this.loadActivityLogs();
    }

    setupTabNavigation() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                
                // Update active tab
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Show correct content
                document.querySelectorAll('.log-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(tab).classList.add('active');
            });
        });
    }

    setupEventListeners() {
        // Visitor log pagination
        // document.getElementById('visitor-prev').addEventListener('click', () => {
        //     if (this.visitorPage > 1) {
        //         this.visitorPage--;
        //         this.loadVisitorLogs();
        //     }
        // });

        // document.getElementById('visitor-next').addEventListener('click', () => {
        //     this.visitorPage++;
        //     this.loadVisitorLogs();
        // });

        // Activity log pagination
        document.getElementById('activity-prev').addEventListener('click', () => {
            if (this.activityPage > 1) {
                this.activityPage--;
                this.loadActivityLogs();
            }
        });

        document.getElementById('activity-next').addEventListener('click', () => {
            this.activityPage++;
            this.loadActivityLogs();
        });

        // Search and filter
        // document.getElementById('visitor-search').addEventListener('input', () => {
        //     this.debounce(() => this.loadVisitorLogs(), 300);
        // });

        document.getElementById('activity-search').addEventListener('input', () => {
            this.debounce(() => this.loadActivityLogs(), 300);
        });

        // document.getElementById('visitor-type-filter').addEventListener('change', () => {
        //     this.loadVisitorLogs();
        // });

        document.getElementById('activity-type-filter').addEventListener('change', () => {
            this.loadActivityLogs();
        });

        // Timeframe filter
        document.getElementById('analytics-timeframe').addEventListener('change', () => {
            this.loadAnalyticsSummary();
        });
    }

    debounce(func, wait) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(func, wait);
    }

    async loadAnalyticsSummary() {
        try {
            const timeframe = document.getElementById('analytics-timeframe').value;
            const data = await this.dashboard.apiCall(`/analytics/summary/?days=${timeframe}`);
            
            if (data) {
                this.updateSummaryCards(data);
                this.renderCharts(data);
            }
        } catch (error) {
            console.error('Error loading analytics summary:', error);
        }
    }

  updateSummaryCards(data) {
      document.getElementById('total-visitors').textContent = data.total_customers.toLocaleString();
      document.getElementById('total-items').textContent = data.total_items.toLocaleString();
      // document.getElementById('total-customers').textContent = data.total_customers.toLocaleString();
      // document.getElementById('total-managers').textContent = data.total_managers.toLocaleString();
      document.getElementById('total-orders').textContent = data.total_orders.toLocaleString();
      document.getElementById('total-revenue').textContent = `ETB ${data.total_revenue.toLocaleString()}`;
      
      // Update popular items with more details
      const popularItemsContainer = document.getElementById('popular-items-list');
      popularItemsContainer.innerHTML = data.popular_items.map(item => `
          <div class="popular-item">
              <div class="item-info">
                  <h4>${item.name}</h4>
                  <div class="item-stats">
                      <span class="stat">${item.total_quantity} sold</span>
                      <span class="stat order">${item.order_count} orders</span>
                      <span class="stat revenue">ETB${(item.total_revenue || 0).toFixed(2)}</span>
                  </div>
              </div>
              <div class="item-percentage">
                  ${((item.total_quantity / data.popular_items.reduce((sum, i) => sum + i.total_quantity, 0)) * 100).toFixed(1)}%
              </div>
          </div>
      `).join('');
  }

  enhanceChartTooltips() {
    // Add custom tooltip for revenue chart
    if (this.charts.revenue) {
        this.charts.revenue.options.plugins.tooltip.callbacks = {
            label: function(context) {
                const dataset = context.dataset;
                const value = context.raw;
                const label = dataset.label || '';
                
                if (dataset.yAxisID === 'y') {
                    return `${label}: ETB${value.toFixed(2)}`;
                } else {
                    return `${label}: ${value} orders`;
                }
            },
            afterLabel: function(context) {
                const datasetIndex = context.datasetIndex;
                const dataIndex = context.dataIndex;
                const chart = context.chart;
                
                if (datasetIndex === 0) { // Revenue dataset
                    const orders = chart.data.datasets[1].data[dataIndex];
                    const avgOrderValue = orders > 0 ? (context.raw / orders).toFixed(2) : 0;
                    return `Avg. Order Value: ETB${avgOrderValue}`;
                }
                return null;
            }
        };
        this.charts.revenue.update();
    }
}

// Call this after rendering all charts
  renderCharts(data) {
      this.renderRevenueChart(data.revenue_data);
      this.renderVisitorChart(data.visitor_data);
      this.renderItemsChart(data.popular_items);
      this.renderCategoriesChart(data.category_revenue);
      this.renderHourlyOrdersChart(data.hourly_orders);
      this.enhanceChartTooltips();
  }

  renderItemsChart(itemsData) {
    const ctx = document.getElementById('items-chart').getContext('2d');
    
    if (this.charts.items) {
        this.charts.items.destroy();
    }
    
    // Sort by total quantity and take top 10
    const sortedItems = [...itemsData].sort((a, b) => b.total_quantity - a.total_quantity).slice(0, 10);
    
    this.charts.items = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedItems.map(item => item.name),
            datasets: [{
                label: 'Quantity Sold',
                data: sortedItems.map(item => item.total_quantity),
                backgroundColor: 'rgba(139, 69, 19, 0.7)',
            }]
        },
        options: {
            indexAxis: 'x', // Horizontal bar chart
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = sortedItems[context.dataIndex];
                            return [
                                `Quantity: ${item.total_quantity}`,
                                `Orders: ${item.order_count}`,
                                `Revenue: ETB${(item.total_revenue || 0).toFixed(2)}`
                            ];
                        }
                    }
                }
            }
        }
    });
  }

  renderCategoriesChart(categoriesData) {
      const ctx = document.getElementById('categories-chart').getContext('2d');
      
      if (this.charts.categories) {
          this.charts.categories.destroy();
      }
      
      // Sort by revenue and take top 10
      const sortedCategories = [...categoriesData].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
      
      this.charts.categories = new Chart(ctx, {
          type: 'doughnut',
          data: {
              labels: sortedCategories.map(cat => cat.category),
              datasets: [{
                  data: sortedCategories.map(cat => cat.revenue),
                  backgroundColor: [
                      '#8B4513', '#A0522D', '#CD853F', '#D2B48C', '#DEB887',
                      '#5D4037', '#7D5D3B', '#9D7D5F', '#BD9D7F', '#DDBD9F'
                  ]
              }]
          },
          options: {
              responsive: true,
              plugins: {
                  legend: {
                      position: 'right',
                  },
                  tooltip: {
                      callbacks: {
                          label: function(context) {
                              const category = sortedCategories[context.dataIndex];
                              return [
                                  `Revenue: ETB${context.raw.toFixed(2)}`,
                                  `Quantity: ${category.quantity}`,
                                  `Orders: ${category.order_count}`
                              ];
                          }
                      }
                  }
              }
          }
      });
  }

  renderHourlyOrdersChart(hourlyData) {
      const ctx = document.getElementById('hourly-orders-chart').getContext('2d');
      
      if (this.charts.hourlyOrders) {
          this.charts.hourlyOrders.destroy();
      }
      
      this.charts.hourlyOrders = new Chart(ctx, {
          type: 'bar',
          data: {
              labels: hourlyData.map(data => data.hour),
              datasets: [{
                  label: 'Orders',
                  data: hourlyData.map(data => data.order_count),
                  backgroundColor: 'rgba(93, 64, 55, 0.7)',
              }]
          },
          options: {
              responsive: true,
              plugins: {
                  legend: {
                      position: 'top',
                  }
              },
              scales: {
                  x: {
                      title: {
                          display: true,
                          text: 'Hour of Day'
                      }
                  },
                  y: {
                      title: {
                          display: true,
                          text: 'Number of Orders'
                      },
                      beginAtZero: true
                  }
              }
          }
      });
  }

  // Update the revenue chart to show both revenue and orders
  renderRevenueChart(revenueData) {
      const ctx = document.getElementById('revenue-chart').getContext('2d');
      
      if (this.charts.revenue) {
          this.charts.revenue.destroy();
      }
      
      this.charts.revenue = new Chart(ctx, {
          type: 'line',
          data: {
              labels: revenueData.map(d => d.date),
              datasets: [
                  {
                      label: 'Daily Revenue (ETB)',
                      data: revenueData.map(d => d.revenue),
                      borderColor: '#8B4513',
                      backgroundColor: 'rgba(139, 69, 19, 0.1)',
                      fill: true,
                      tension: 0.4,
                      yAxisID: 'y'
                  },
                  {
                      label: 'Number of Orders',
                      data: revenueData.map(d => d.order_count),
                      borderColor: '#5D4037',
                      backgroundColor: 'rgba(93, 64, 55, 0.1)',
                      fill: true,
                      tension: 0.4,
                      yAxisID: 'y1'
                  }
              ]
          },
          options: {
              responsive: true,
              plugins: {
                  legend: {
                      position: 'top',
                  }
              },
              scales: {
                  y: {
                      type: 'linear',
                      display: true,
                      position: 'left',
                      title: {
                          display: true,
                          text: 'Revenue (ETB)'
                      }
                  },
                  y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      title: {
                          display: true,
                          text: 'Orders'
                      },
                      grid: {
                          drawOnChartArea: false,
                      },
                  }
              }
          }
      });
  }

  renderVisitorChart(visitorData) {
    const ctx = document.getElementById('visitor-chart').getContext('2d');
    
    if (this.charts.visitor) {
        this.charts.visitor.destroy();
    }
    
    this.charts.visitor = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: visitorData.map(d => d.date),
            datasets: [{
                label: 'Daily Visitors',
                data: visitorData.map(d => d.visitors),
                backgroundColor: 'rgba(139, 69, 19, 0.7)',
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                }
            }
        }
    });
  }



    // async loadVisitorLogs() {
    //     try {
    //         const search = document.getElementById('visitor-search').value;
    //         const typeFilter = document.getElementById('visitor-type-filter').value;
            
    //         let url = `/analytics/visitors/?page=${this.visitorPage}&per_page=${this.perPage}`;
    //         if (search) url += `&search=${encodeURIComponent(search)}`;
    //         if (typeFilter) url += `&type=${typeFilter}`;
            
    //         const data = await this.dashboard.apiCall(url);
            
    //         // if (data) {
    //         //     this.renderVisitorLogs(data);
    //         // }
    //     } catch (error) {
    //         console.error('Error loading visitor logs:', error);
    //     }
    // }

    // renderVisitorLogs(data) {
    //     const tbody = document.getElementById('visitor-log-body');
    //     tbody.innerHTML = data.data.map(visitor => `
    //         <tr>
    //             <td><span class="badge ${visitor.visitor_type}">${visitor.visitor_type}</span></td>
    //             <td>${visitor.page_visited}</td>
    //             <td>${visitor.os || 'N/A'}</td>
    //             <td>${visitor.device || 'N/A'}</td>
    //             <td>${new Date(visitor.timestamp).toLocaleString()}</td>
    //             <td>${visitor.duration}s</td>
    //         </tr>
    //     `).join('');
        
    //     // Update pagination info
    //     document.getElementById('visitor-page-info').textContent = 
    //         `Page ${data.page} of ${data.total_pages}`;
        
    //     // Update button states
    //     document.getElementById('visitor-prev').disabled = data.page <= 1;
    //     document.getElementById('visitor-next').disabled = data.page >= data.total_pages;
    // }

    async loadActivityLogs() {
        try {
            const search = document.getElementById('activity-search').value;
            const typeFilter = document.getElementById('activity-type-filter').value;
            
            let url = `/analytics/activities/?page=${this.activityPage}&per_page=${this.perPage}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;
            if (typeFilter) url += `&type=${typeFilter}`;
            
            const data = await this.dashboard.apiCall(url);
            
            if (data) {
                this.renderActivityLogs(data);
            }
        } catch (error) {
            console.error('Error loading activity logs:', error);
        }
    }

    renderActivityLogs(data) {
        const tbody = document.getElementById('activity-log-body');
        tbody.innerHTML = data.data.map(activity => `
            <tr>
                <td>${this.formatActivityType(activity.activity_type)}</td>
                <td>${activity.username || 'System'}</td>
                <td>${this.formatActivityDetails(activity)}</td>
                <td>${new Date(activity.timestamp).toLocaleString()}</td>
            </tr>
        `).join('');
        
        // Update pagination info
        document.getElementById('activity-page-info').textContent = 
            `Page ${data.page} of ${data.total_pages}`;
        
        // Update button states
        document.getElementById('activity-prev').disabled = data.page <= 1;
        document.getElementById('activity-next').disabled = data.page >= data.total_pages;
    }

    formatActivityType(type) {
        const types = {
            'menu_view': 'Menu View',
            'category_view': 'Category View',
            'item_view': 'Item View',
            'order_placed': 'Order Placed',
            'qr_generated': 'QR Generated',
            'item_created': 'Item Created',
            'item_updated': 'Item Updated',
            'item_deleted': 'Item Deleted',
            'login': 'Login',
            'logout': 'Logout'
        };
        return types[type] || type;
    }

    formatActivityDetails(activity) {
        try {
            const details = activity.details;
            if (typeof details === 'string') {
                return details;
            }
            
            switch(activity.activity_type) {
                case 'order_placed':
                    return `Order #${details.order_id} - Table ${details.table_number} - ETB${details.total_amount}`;
                case 'item_created':
                case 'item_updated':
                case 'item_deleted':
                    return `${details.item_name} (ID: ${details.item_id})`;
                case 'qr_generated':
                    return `QR for Table ${details.table_number}`;
                case 'login':
                case 'logout':
                    return `IP: ${details.ip_address}`;
                default:
                    return JSON.stringify(details);
            }
        } catch (e) {
            return 'N/A';
        }
    }
}

// Initialize manager dashboard
const manager = new ManagerDashboard()

// document.addEventListener('DOMContentLoaded', function() {
//     window.manager = new ManagerDashboard();
// });

