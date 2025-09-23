# Next.js Frontend Modernization: Streaming RAG Interface

## Project Context
I have a Next.js RAG (Retrieval-Augmented Generation) application with an existing `/ask` page that needs to be modernized. I just completed implementing enhanced LLM streaming on the backend with proper OpenAI/ChatGPT streaming, completion events, and ResponseCompletedEvent handling.

## Current Backend Streaming Implementation
The backend now supports:
- ✅ Proper OpenAI streaming (no more fallback to non-streaming)
- ✅ Generic streaming events: `chunk`, `completion`, `response_completed`, `done`
- ✅ Environment variable control via `LLM_STREAMING=true`
- ✅ ResponseCompletedEvent with metadata after streaming completes
- ✅ Provider-specific event handling (OpenAI vs vLLM)

## Frontend Modernization Requirements

### 🎨 **Design & UI Modernization**
1. **Dark Mode Theme**: Convert entire application to dark mode design
2. **Background**: Implement a dark blueish gradient background
3. **Typography**: Install and use Google Font "Poppins" as the default font
4. **Component Library**: Install Tailwind CSS (if not already done) and integrate shadcn/ui components
5. **Modern Aesthetics**: Clean, minimal, modern design language

### 🔄 **Chat Interface Redesign**
1. **Simplified Layout**: Transform the ask page into a modern chat interface
2. **Document ID Integration**: Move the document ID section into the "ask a question" container
3. **Response Positioning**: Display responses above the input container (chat-like flow)
4. **Fade-in Animation**: Response container should fade in smoothly when request is submitted
5. **Loading State**: Show loading skeleton while waiting for streaming response to start

### 📡 **Streaming Implementation**
1. **Real-time Streaming**: Implement proper LLM response streaming in the UI
2. **Progressive Text Display**: Display text chunks as they arrive from the backend
3. **Loading States**: Handle different loading states (waiting, streaming, complete)
4. **Error Handling**: Graceful error handling for streaming failures
5. **Completion Events**: Handle `ResponseCompletedEvent` for final metadata display

## Technical Requirements

### **Dependencies to Install/Verify**
```bash
# Tailwind CSS (if not installed)
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# shadcn/ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input textarea skeleton

# Google Fonts (Poppins)
# Add to next.config.js or use @next/font
```

### **Streaming API Integration**
The backend `/ask` endpoint now supports streaming when `LLM_STREAMING=true`. Expected response format:
```javascript
// Non-streaming response (current)
{
  answer: "Full response text...",
  retrievedDocuments: [...],
  citations: [...],
  // ... other metadata
}

// Streaming response (new - to implement)
// Server-Sent Events or fetch with ReadableStream
// Events: 'chunk', 'citations', 'metadata', 'response_completed', 'done'
```

### **Key UI Components to Create/Update**
1. **ChatContainer**: Main chat interface wrapper
2. **MessageBubble**: Individual response display component
3. **InputContainer**: Combined input + document ID section
4. **LoadingSkeleton**: Animated loading placeholder
5. **StreamingText**: Component that handles progressive text display
6. **ResponseMetadata**: Display citations, confidence, metrics

### **User Flow**
1. User enters question in input field
2. User optionally specifies document ID filter
3. User submits → input container stays at bottom
4. Response container fades in above input with loading skeleton
5. Streaming text progressively fills the response as chunks arrive
6. Citations and metadata appear when streaming completes
7. Final `ResponseCompletedEvent` shows completion summary

### **Design Specifications**
- **Color Scheme**: Dark blue gradient (#0f172a → #1e293b → #334155)
- **Font**: Poppins (400, 500, 600, 700 weights)
- **Spacing**: Generous whitespace, modern padding/margins
- **Animations**: Smooth fade-ins, skeleton loading, text streaming
- **Responsive**: Mobile-first design with proper breakpoints

## Current File Structure
```
apps/web/
├── src/
│   ├── app/
│   │   ├── ask/
│   │   │   └── page.tsx          # Main ask page to modernize
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ask/
│   │   │   ├── AnswerDisplay.tsx  # Update for streaming
│   │   │   ├── QuestionInput.tsx  # Modernize input
│   │   │   └── CitationsList.tsx  # Update styling
│   │   └── Navigation.tsx
│   └── utils/
│       └── api.ts                # Update for streaming
```

## Implementation Priority
1. **Setup**: Install dependencies (Tailwind, shadcn, Poppins)
2. **Theme**: Implement dark mode and gradient background
3. **Layout**: Restructure ask page to chat interface
4. **Streaming**: Implement real-time text streaming
5. **Polish**: Add animations, loading states, error handling

## Expected Deliverables
- Modernized dark mode design with Poppins font
- Chat-like interface with repositioned elements
- Real-time streaming text display
- Smooth animations and loading states
- Mobile-responsive design
- Error handling for streaming failures

**Note**: The backend streaming is already implemented and tested. Focus on creating a beautiful, modern frontend that showcases the real-time streaming capabilities.