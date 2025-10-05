// frontend/scripts/chatbot.js
class AeroSentryChatbot {
    constructor() {
        this.isOpen = false;
        this.isLoading = false;
        this.chatHistory = [];
        this.initializeChatbot();
    }

    initializeChatbot() {
        // Create chatbot HTML structure
        this.createChatbotHTML();
        this.setupEventListeners();
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div id="aerosentry-chatbot" class="chatbot-container">
                <!-- Chatbot Toggle Button -->
                <div id="chatbot-toggle" class="chatbot-toggle">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
                    </svg>
                </div>

                <!-- Chat Window -->
                <div id="chatbot-window" class="chatbot-window hidden">
                    <div class="chatbot-header">
                        <h3 class="chatbot-title">AeroSentry AI Assistant</h3>
                        <button id="chatbot-close" class="chatbot-close-btn">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div id="chatbot-messages" class="chatbot-messages">
                        <div class="chatbot-welcome">
                            <p>👋 Hello! I'm your AeroSentry AI assistant. I can help you with:</p>
                            <ul>
                                <li>• Weather interpretation</li>
                                <li>• Flight planning advice</li>
                                <li>• METAR/TAF explanations</li>
                                <li>• Aviation safety questions</li>
                            </ul>
                            <p>Ask me anything about your flight briefing!</p>
                        </div>
                    </div>
                    
                    <div class="chatbot-input-container">
                        <div class="chatbot-input-wrapper">
                            <input type="text" id="chatbot-input" placeholder="Ask about weather, routes, or safety..." 
                                   class="chatbot-input" maxlength="500">
                            <button id="chatbot-send" class="chatbot-send-btn">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                            </button>
                        </div>
                        <div class="chatbot-disclaimer">
                            <small>AI responses are for guidance only. Always consult official sources.</small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    }

    setupEventListeners() {
        // Toggle chatbot
        document.getElementById('chatbot-toggle').addEventListener('click', () => this.toggleChatbot());
        document.getElementById('chatbot-close').addEventListener('click', () => this.closeChatbot());

        // Send message on button click or Enter key
        document.getElementById('chatbot-send').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatbot-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Close chatbot when clicking outside
        document.addEventListener('click', (e) => {
            const chatbot = document.getElementById('aerosentry-chatbot');
            if (!chatbot.contains(e.target) && this.isOpen) {
                this.closeChatbot();
            }
        });
    }

    toggleChatbot() {
        this.isOpen = !this.isOpen;
        const window = document.getElementById('chatbot-window');
        const toggle = document.getElementById('chatbot-toggle');

        if (this.isOpen) {
            window.classList.remove('hidden');
            toggle.classList.add('active');
            document.getElementById('chatbot-input').focus();
        } else {
            window.classList.add('hidden');
            toggle.classList.remove('active');
        }
    }

    closeChatbot() {
        this.isOpen = false;
        document.getElementById('chatbot-window').classList.add('hidden');
        document.getElementById('chatbot-toggle').classList.remove('active');
    }

    async sendMessage() {
        const input = document.getElementById('chatbot-input');
        const message = input.value.trim();

        if (!message) return;

        // Add user message to chat
        this.addMessage(message, 'user');
        input.value = '';
        
        // Show loading indicator
        this.showLoading();

        try {
            // Simulate AI response (replace with actual API call)
            const response = await this.getAIResponse(message);
            this.addMessage(response, 'assistant');
        } catch (error) {
            this.addMessage("I'm having trouble connecting right now. Please try again shortly.", 'assistant');
            console.error('Chatbot error:', error);
        } finally {
            this.hideLoading();
        }
    }

    async getAIResponse(userMessage) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthManager.getToken()}`
                },
                body: JSON.stringify({
                    message: userMessage,
                    context: this.getAviationContext()
                })
            });
    
            if (!response.ok) throw new Error('API request failed');
            
            const data = await response.json();
            return data.response;
        } catch (error) {
            console.error('AI API error:', error);
            return this.generateMockResponse(userMessage); // Fallback
        }
    }

    generateMockResponse(userMessage) {
        // Simple keyword-based responses for demonstration
        const responses = {
            'weather': "I analyze real-time METAR and TAF data to provide weather assessments. For detailed current conditions, generate a flight briefing above.",
            'metar': "METAR provides current weather observations. I can help interpret METAR codes like visibility, cloud layers, and precipitation.",
            'taf': "TAF is a terminal aerodrome forecast predicting weather changes. I explain TAF periods and significant changes.",
            'safety': "Safety is paramount. I emphasize checking all weather sources, having alternates, and following regulatory guidelines.",
            'route': "I analyze optimal routes considering weather, airspace, and performance. Generate a briefing for specific route analysis.",
            'fuel': "Fuel planning requires considering weather, alternates, and reserves. Always follow FAR fuel requirements.",
            'emergency': "For emergencies, follow your checklist and contact ATC immediately. I provide general procedures only.",
            'default': "I specialize in aviation weather and flight planning. Could you clarify your question about flight operations or weather interpretation?"
        };

        const lowerMessage = userMessage.toLowerCase();
        
        for (const [keyword, response] of Object.entries(responses)) {
            if (lowerMessage.includes(keyword) && keyword !== 'default') {
                return response;
            }
        }

        return responses.default;
    }

    addMessage(content, sender) {
        const messagesContainer = document.getElementById('chatbot-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${sender}-message`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">${this.formatMessage(content)}</div>
                <div class="message-time">${timestamp}</div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Add to chat history
        this.chatHistory.push({ sender, content, timestamp });
    }

    formatMessage(text) {
        // Convert line breaks and basic formatting
        return text.replace(/\n/g, '<br>')
                  .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                  .replace(/_(.*?)_/g, '<em>$1</em>');
    }

    showLoading() {
        const messagesContainer = document.getElementById('chatbot-messages');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'chatbot-loading';
        loadingDiv.className = 'chat-message assistant-message';
        loadingDiv.innerHTML = `
            <div class="message-content">
                <div class="message-text">
                    <div class="loading-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(loadingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    hideLoading() {
        const loadingDiv = document.getElementById('chatbot-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AeroSentryChatbot();
});