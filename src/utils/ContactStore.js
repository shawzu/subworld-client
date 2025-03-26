'use client'

/**
 * Manages contact information and conversation state
 */
class ContactStore {
  constructor() {
    this.contacts = []
    this.initialized = false
  }
  
  /**
   * Initialize the contact store
   */
  async initialize() {
    if (this.initialized) return
    
    try {
      // Load contacts from localStorage
      const contactsJson = localStorage.getItem('subworld_contacts')
      this.contacts = contactsJson ? JSON.parse(contactsJson) : []
      this.initialized = true
    } catch (error) {
      console.error('Error initializing contact store:', error)
      this.contacts = []
    }
  }
  
  /**
   * Get all contacts
   * @returns {Array} - Array of contacts
   */
  getAllContacts() {
    return [...this.contacts]
  }
  
  /**
   * Save a new contact or update an existing one
   * @param {string} publicKey - Contact's public key
   * @param {string} alias - Contact's alias (nickname)
   * @returns {boolean} - Success status
   */
  saveContact(publicKey, alias) {
    try {
      // Check if contact exists
      const existingContactIndex = this.contacts.findIndex(c => c.publicKey === publicKey)
      
      if (existingContactIndex >= 0) {
        // Update existing contact
        this.contacts[existingContactIndex] = {
          ...this.contacts[existingContactIndex],
          alias: alias || this.contacts[existingContactIndex].alias,
          updatedAt: new Date().toISOString()
        }
      } else {
        // Add new contact
        this.contacts.push({
          publicKey,
          alias: alias || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      }
      
      // Save updated contacts to localStorage
      this._persistContacts()
      return true
    } catch (error) {
      console.error('Error saving contact:', error)
      return false
    }
  }
  
  /**
   * Delete a contact
   * @param {string} publicKey - Contact's public key
   * @returns {boolean} - Success status
   */
  deleteContact(publicKey) {
    try {
      // Filter out the contact
      const originalLength = this.contacts.length
      this.contacts = this.contacts.filter(c => c.publicKey !== publicKey)
      
      // Check if a contact was removed
      if (this.contacts.length < originalLength) {
        this._persistContacts()
        return true
      }
      return false
    } catch (error) {
      console.error('Error deleting contact:', error)
      return false
    }
  }
  
  /**
   * Get a contact by public key
   * @param {string} publicKey - Contact's public key
   * @returns {Object|null} - Contact object or null if not found
   */
  getContact(publicKey) {
    return this.contacts.find(c => c.publicKey === publicKey) || null
  }
  
  /**
   * Get display name for a contact (alias or truncated public key)
   * @param {string} publicKey - Contact's public key
   * @returns {string} - Display name
   */
  getContactDisplayName(publicKey) {
    const contact = this.getContact(publicKey)
    if (contact && contact.alias) {
      return contact.alias
    }
    // If no alias, use the public key (possibly truncated if too long)
    return publicKey
  }
  
  /**
   * Persist contacts to localStorage
   * @private
   */
  _persistContacts() {
    localStorage.setItem('subworld_contacts', JSON.stringify(this.contacts))
  }
}

// Create singleton instance
const contactStore = new ContactStore()

export default contactStore