# cw-rag-core Documentation

Welcome to the comprehensive architectural documentation for the **cw-rag-core** system - a modern, multi-tenant RAG (Retrieval-Augmented Generation) platform built for scalable information retrieval and knowledge management.

## 📋 Documentation Index

### 🏗️ Architecture
High-level system design and architectural decisions:

- **[System Overview](architecture/overview.md)** - High-level architecture, design philosophy, and core principles
- **[Component Architecture](architecture/components.md)** - Detailed component responsibilities and boundaries
- **[Data Flow](architecture/data-flow.md)** - Information flow through the system from ingestion to retrieval
- **[Technology Stack](architecture/technology-stack.md)** - Technology choices and technical rationale
- **[Security Model](architecture/security-model.md)** - RBAC, tenant isolation, and security boundaries

### 🎨 Design
Code organization and design patterns:

- **[Monorepo Structure](design/monorepo-structure.md)** - Code organization principles and workspace architecture
- **[Type System Architecture](design/type-system.md)** - TypeScript type architecture and shared interfaces
- **[API Design Patterns](design/api-design.md)** - REST API design conventions and patterns
- **[Database Schema](design/database-schema.md)** - Qdrant collection design and vector storage strategy

### 💡 Concepts
Core domain concepts and implementation details:

- **[RAG Fundamentals](concepts/rag-fundamentals.md)** - RAG concepts and implementation approach
- **[Vector Search Strategy](concepts/vector-search.md)** - Vector similarity search and embedding strategy
- **[Document Lifecycle](concepts/document-lifecycle.md)** - Complete pipeline from ingestion to retrieval
- **[Multi-Tenancy](concepts/multi-tenancy.md)** - Tenant isolation and access control design

### 🔗 Integration
System integration and extensibility:

- **[n8n Automation](integration/n8n-automation.md)** - Workflow automation architecture and patterns
- **[Docker Strategy](integration/docker-strategy.md)** - Containerization and orchestration design
- **[Extension Points](integration/extension-points.md)** - How to extend the system (embedding services, LLMs, etc.)

## 🎯 Target Audience

This documentation is designed for:

- **Senior developers** new to the project who need to understand the system architecture
- **System architects** evaluating the design decisions and patterns
- **Contributors** who need to understand design intent before making changes
- **DevOps engineers** deploying and maintaining the system
- **Product managers** understanding system capabilities and limitations

## 🚀 Quick Navigation

| I want to... | Start here |
|--------------|------------|
| Understand the overall system | [System Overview](architecture/overview.md) |
| Learn about security and access control | [Security Model](architecture/security-model.md) |
| Understand the codebase structure | [Monorepo Structure](design/monorepo-structure.md) |
| Learn about RAG implementation | [RAG Fundamentals](concepts/rag-fundamentals.md) |
| Extend the system | [Extension Points](integration/extension-points.md) |
| Deploy the system | [Docker Strategy](integration/docker-strategy.md) |

## 📚 Documentation Principles

This documentation follows these principles:

- **Architecture over Operations**: Focus on design decisions and system understanding rather than step-by-step procedures
- **Conceptual Clarity**: Explain the "why" behind design decisions, not just the "what"
- **Code References**: Link to actual implementation where relevant
- **Visual Representation**: Use diagrams and visual aids to explain complex relationships
- **Future-Oriented**: Consider how the architecture supports growth and evolution

## 🔧 Contributing to Documentation

When updating this documentation:

1. **Keep architecture focus**: Document design intent, not implementation details
2. **Update cross-references**: Ensure links between documents remain valid
3. **Maintain consistency**: Follow the established structure and style
4. **Include code references**: Link to actual implementation using relative paths
5. **Consider the audience**: Write for developers who need to understand and extend the system

## 📖 Related Resources

- **[Main README](../README.md)** - Operational documentation and quick start guide
- **[API Documentation](../README.md#5-api-reference)** - Detailed API endpoint documentation
- **[Development Guide](../README.md#6-development-guide)** - Step-by-step development procedures

---

*This documentation covers the architectural design of cw-rag-core v1.0.0. For operational procedures and quick setup, see the [main README](../README.md).*