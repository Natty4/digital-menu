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

    async verifyToken() {
        try {
            this.showLoading();
            const response = await fetch('/api/menu_items/', {
                headers: {
                    'Authorization': `Token ${this.authToken}`,
                    'X-CSRFToken': this.getCSRFToken()
                }
            });
            
            if (response.ok) {
                this.isAuthenticated = true;
                this.hideLoginModal();
                this.showManagerContent();
                this.initializeDashboard();
            } else {
                // Token is invalid
                localStorage.removeItem('managerToken');
                this.authToken = null;
                this.showLoginModal();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem('managerToken');
            this.authToken = null;
            this.showLoginModal();
        } finally {
            this.hideLoading();
        }
    }

    async handleLogin() {
        const username = document.getElementById('manager-username').value;
        const password = document.getElementById('manager-password').value;
        const errorElement = document.getElementById('login-error');
        
        // Clear previous errors
        if (errorElement) {
            errorElement.classList.add('hidden');
        }
        
        if (!username || !password) {
            this.showError('Please enter both username and password');
            return;
        }
        
        try {
            this.showLoading();
            const response = await fetch('/api/manager/login/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCSRFToken()
                },
                body: JSON.stringify({ username, password })
            });
            
            if (response.ok) {
                const data = await response.json();
                this.authToken = data.token;
                localStorage.setItem('managerToken', this.authToken);
                this.isAuthenticated = true;
                
                this.hideLoginModal();
                this.showManagerContent();
                this.initializeDashboard();
                
            } else {
                const errorData = await response.json();
                const errorMessage = errorData.non_field_errors ? 
                    errorData.non_field_errors[0] : 
                    'Login failed. Please check your credentials.';
                
                this.showError(errorMessage);
                console.log(errorData, '--------------');
            }
        } catch (error) {
            this.showError('Network error. Please try again.');
            console.error('Login error:', error);
        } finally {
            this.hideLoading();
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
        const passwordInput = document.getElementById('manager-password');
        if (passwordInput) passwordInput.focus();
    }

    hideLoginModal() {
        const loginModal = document.getElementById('manager-login-modal');
        if (loginModal) loginModal.classList.add('hidden');
    }

    showManagerContent() {
        const managerContent = document.getElementById('manager-content');
        if (managerContent) managerContent.classList.remove('hidden');
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
      this.activeRequests++;
      if (this.activeRequests === 1) {
          document.getElementById('loading-overlay').classList.remove('hidden');
      }
  }

  // Hide loading indicator
  hideLoading() {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      if (this.activeRequests === 0) {
          document.getElementById('loading-overlay').classList.add('hidden');
      }
  }
  
  // API Functions
  async apiCall(endpoint, options = {}) {
        this.showLoading();
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${this.authToken}`
            }
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(`${window.location.origin}/api${endpoint}`, finalOptions);
            
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('managerToken');
                this.authToken = null;
                this.isAuthenticated = false;
                this.showLoginModal();
                return null;
            }
            
            if (response.status === 204) {
                return { status: 204 };
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                this.showToast(errorData?.detail || `API error: ${response.status}`);
                throw new Error(errorData?.detail || `API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            this.showToast('Operation failed. Please try again.');
            return null;
        } finally {
            this.hideLoading();
        }
    }

   async logout() {
    try {
        // Try to call the logout endpoint to invalidate the token server-side
        await this.apiCall('/manager/logout/', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Logout API call failed, but proceeding with client-side logout:', error);
        // Continue with client-side logout even if API call fails
    } finally {
        localStorage.removeItem('managerToken');
        window.location.href = '/manager_login.html';
    }
  }

  async fetchMenuItems() {
    const data = await this.apiCall('/menu_items/')
    if (data) {
      this.menuItems = data.results || data
      this.renderMenuTable()
    }
  }

  async fetchCategories() {
    const data = await this.apiCall('/categories/')
    if (data) {
      this.categories = data.results || data
      this.renderCategoryTable()
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
    const formData = new FormData();

    // Append all fields to form data
    Object.keys(itemData).forEach(key => {
        if (key === 'image' && itemData[key] instanceof File) {
            formData.append('image', itemData[key]);
        } else if (key === 'category') {
            // Ensure category is sent as ID
            formData.append('category', itemData[key]);
        } else if (key !== 'image') { // Skip image field if it's not a File
            formData.append(key, itemData[key]);
        }
    });

    let endpoint = '/api/menu_items/';
    let method = 'POST';

    if (this.editingItemId) {
        endpoint = `/api/menu_items/${this.editingItemId}/`;
        method = 'PUT';
    }

    const options = {
        method: method,
        headers: {
            'Authorization': `Token ${this.authToken}`,
            // Note: Don't set Content-Type for FormData, let browser set it with boundary
        },
        body: formData
    };

    // Remove Content-Type header for FormData (browser will set it with boundary)
    delete options.headers['Content-Type'];

    try {
        this.showLoading();
        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || errorData.message || 'Failed to save menu item');
        }
        
        const data = await response.json();
        await this.fetchMenuItems(); // Refresh the list
        this.clearMenuItemModal();
        document.getElementById("menu-item-modal").classList.add("hidden");
        this.showToast('Menu item saved successfully.', 'success');
        return data;
    } catch (error) {
        console.error('Error saving menu item:', error);
        this.showToast(error.message || 'There was an error saving the menu item. Please try again.');
        throw error;
    } finally {
        this.hideLoading();
    }
  }



  clearMenuItemModal() {
    // Clear all fields in the modal
    document.getElementById('item-name-input').value = '';
    document.getElementById('item-price-input').value = '';
    document.getElementById('item-description-input').value = '';
    document.getElementById('item-category-input').value = '';
    document.getElementById('item-image-input').value = ''; // Optional: Reset image input
    document.getElementById('item-image-preview').classList.add('hidden'); // Hide image preview
    document.getElementById('item-available-input').checked = true; // Reset "available" checkbox if needed
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
                  <button class="btn-download">Download <i class="fas fa-download"></i></button>
                  <button class="btn-print">Print <i class="fas fa-print"></i></button>
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


  logout() {
        localStorage.removeItem('managerToken');
        this.authToken = null;
        this.isAuthenticated = false;
        this.showLoginModal();
        this.hideManagerContent();
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

              // Update active nav item
              navItems.forEach((nav) => nav.classList.remove("active"));
              item.classList.add("active");

              // Update active section
              sections.forEach((section) => section.classList.remove("active"));
              document.getElementById(`${sectionName}-section`).classList.add("active");

              this.currentSection = sectionName;
              
              // Refresh data when switching to orders section
              if (sectionName === 'orders') {
                  this.fetchOrders();
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

  renderMenuTable() {
    const tbody = document.getElementById("menu-table-body")
    tbody.innerHTML = ""

    this.menuItems.forEach((item) => {
      const row = document.createElement("tr")
      row.innerHTML = `
                <td>
                    <div class="item-info">
                        <div class="item-thumbnail">
                            <img src="${item.image_url || 'https://plakarestaurant.ca/wp-content/themes/twentytwentythree-child/img/food-placeholder.png'}" alt="${item.name}" />
                        </div>
                        <div class="item-details">
                            <h4>${item.name}</h4>
                            <p>${item.description}</p>
                        </div>
                    </div>
                </td>
                <td>ETB${item.price}</td>
                <td>${item.category_details ? item.category_details.name : 'Uncategorized'}</td>
                <td>
                    <div class="availability-toggle">
                        <div class="toggle-switch ${item.is_available ? "active" : ""}" 
                             onclick="manager.toggleAvailability(${item.id})">
                        </div>
                        <span>${item.is_available ? "Available" : "Unavailable"}</span>
                    </div>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline" onclick="manager.editItem(${item.id})">
                            Edit
                        </button>
                        <button class="btn btn-sm btn-outline danger" onclick="manager.deleteItem(${item.id})">
                            Delete
                        </button>
                    </div>
                </td>
            `
      tbody.appendChild(row)
    })
  }

  renderCategoryTable() {
    const tbody = document.getElementById("category-table-body")
    tbody.innerHTML = ""

    this.categories.forEach((cat) => {
      const row = document.createElement("tr")
      row.innerHTML = `
                <td>${cat.name}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-outline" onclick="manager.editCategory('${cat.id}')">
                            Edit
                        </button>
                        <button class="btn btn-sm btn-outline danger" onclick="manager.deleteCategory('${cat.id}')">
                            Delete
                        </button>
                    </div>
                </td>
            `
      tbody.appendChild(row)
    })
  }

  renderOrders() {
    const container = document.getElementById("orders-container")
    container.innerHTML = ""

    this.orders.forEach((order) => {
      const orderCard = document.createElement("div")
      orderCard.className = `order-card ${order.status}`
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
                    <button class="btn btn-sm btn-primary" onclick="manager.updateOrderStatus(${order.id}, 'in_progress')">
                        Start Preparing
                    </button>
                    ` : ''}
                    ${order.status === 'in_progress' ? `
                    <button class="btn btn-sm btn-outline" onclick="manager.updateOrderStatus(${order.id}, 'completed')">
                        Mark Complete
                    </button>
                    ` : ''}
                    ${order.status === 'new' || order.status === 'pending' || order.status === 'in_progress' ? `
                    <button class="btn btn-sm btn-outline danger" onclick="manager.updateOrderStatus(${order.id}, 'cancelled')">
                        Cancel
                    </button>
                    ` : ''}
                    ${order.status === 'completed' || order.status === 'cancelled' ? `
                    <button class="btn btn-sm btn-outline danger-2" onclick="manager.updateOrderStatus(${order.id}, 'archived')">
                        Archive
                    </button>
                    ` : ''}
                </div>
            `
      container.appendChild(orderCard)
    })
  }

  openItemModal(item = null) {
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
      select.value = this.categories[0]?.id || ""
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
      const orderDate = new Date(order.created_at).toDateString()
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
    const addItemBtn = document.getElementById("add-menu-item")
    const modal = document.getElementById("menu-item-modal")
    const closeBtn = document.getElementById("menu-item-modal-close")
    const saveBtn = document.getElementById("save-menu-item")
    const cancelBtn = document.getElementById("cancel-menu-item")
    const imageInput = document.getElementById("item-image-input")

    addItemBtn.addEventListener("click", () => {
      this.openItemModal()
    })

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

    addCategoryBtn.addEventListener("click", () => {
      this.openCategoryModal()
    })

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
    // Refresh orders every 30 seconds
    setInterval(() => {
      if (this.currentSection === 'orders') {
        this.fetchOrders()
      }
    }, 30000)
  }
}

// Initialize manager dashboard
const manager = new ManagerDashboard()

// document.addEventListener('DOMContentLoaded', function() {
//     window.manager = new ManagerDashboard();
// });