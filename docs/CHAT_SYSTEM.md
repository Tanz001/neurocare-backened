# Système de Chat - Documentation

## Vue d'ensemble

Le système de chat permet la communication en temps réel entre les médecins (doctors) et les patients. Il supporte les messages texte, les images et les fichiers.

## Structure de la Base de Données

### Table `chats`

Stocke les conversations entre un médecin et un patient.

```sql
CREATE TABLE chats (
    chat_id BIGINT NOT NULL AUTO_INCREMENT,
    doctor_id BIGINT NOT NULL,
    patient_id BIGINT NOT NULL,
    last_message_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id),
    KEY doctor_id (doctor_id),
    KEY patient_id (patient_id),
    KEY last_message_at (last_message_at),
    FOREIGN KEY (doctor_id) REFERENCES users(id),
    FOREIGN KEY (patient_id) REFERENCES users(id)
);
```

### Table `messages`

Stocke les messages individuels dans chaque conversation.

```sql
CREATE TABLE messages (
    message_id BIGINT NOT NULL AUTO_INCREMENT,
    chat_id BIGINT NOT NULL,
    sender_id BIGINT NOT NULL,
    sender_role ENUM('doctor', 'patient') NOT NULL,
    message_type ENUM('text', 'file', 'image') NOT NULL DEFAULT 'text',
    message_text TEXT NULL,
    file_url VARCHAR(500) NULL,
    file_name VARCHAR(255) NULL,
    file_type VARCHAR(50) NULL,
    file_size INT(11) NULL,
    is_read TINYINT(1) NULL DEFAULT 0,
    read_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id),
    KEY chat_id (chat_id),
    KEY sender_id (sender_id),
    KEY sender_role (sender_role),
    KEY is_read (is_read),
    KEY created_at (created_at),
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);
```

## API Endpoints

Tous les endpoints nécessitent une authentification via Bearer Token.

### 1. Obtenir ou créer un chat

**POST** `/api/chat/get-or-create`

Crée un nouveau chat ou retourne un chat existant entre un médecin et un patient.

**Request Body:**
```json
{
  "doctor_id": 1,
  "patient_id": 2
}
```

**Response (200/201):**
```json
{
  "success": true,
  "message": "Chat found" | "Chat created successfully",
  "chat": {
    "chat_id": 1,
    "doctor_id": 1,
    "patient_id": 2,
    "last_message_at": "2024-01-15T10:30:00Z",
    "created_at": "2024-01-10T08:00:00Z"
  }
}
```

**Permissions:**
- Le médecin ne peut accéder qu'aux chats où il est le médecin
- Le patient ne peut accéder qu'aux chats où il est le patient

### 2. Envoyer un message

**POST** `/api/chat/message`

Envoie un message texte ou un fichier dans un chat.

**Request (multipart/form-data):**
- `chat_id` (optionnel): ID du chat
- `doctor_id` (optionnel): ID du médecin (si chat_id non fourni)
- `patient_id` (optionnel): ID du patient (si chat_id non fourni)
- `message_text` (optionnel): Texte du message
- `file` (optionnel): Fichier à envoyer (image ou document)

**Note:** Soit `chat_id` doit être fourni, soit `doctor_id` et `patient_id` doivent être fournis ensemble.

**Types de fichiers acceptés:**
- Images: jpeg, jpg, png, gif, webp
- Documents: pdf, doc, docx
- Taille maximale: 10MB

**Response (201):**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "message_data": {
    "message_id": 1,
    "chat_id": 1,
    "sender_id": 2,
    "sender_role": "patient",
    "message_type": "text" | "file" | "image",
    "message_text": "Hello doctor!",
    "file_url": null,
    "file_name": null,
    "file_type": null,
    "file_size": null,
    "is_read": false,
    "read_at": null,
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### 3. Obtenir les messages d'un chat

**GET** `/api/chat/messages/:chatId`

Récupère les messages d'un chat avec pagination.

**Query Parameters:**
- `limit` (optionnel, défaut: 50): Nombre de messages à récupérer
- `offset` (optionnel, défaut: 0): Nombre de messages à ignorer

**Response (200):**
```json
{
  "success": true,
  "message": "Messages retrieved successfully",
  "messages": [
    {
      "message_id": 1,
      "chat_id": 1,
      "sender_id": 2,
      "sender_role": "patient",
      "message_type": "text",
      "message_text": "Hello doctor!",
      "file_url": null,
      "file_name": null,
      "file_type": null,
      "file_size": null,
      "is_read": true,
      "read_at": "2024-01-15T10:31:00Z",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 1
}
```

**Note:** Les messages sont retournés dans l'ordre chronologique (plus ancien en premier).

### 4. Obtenir tous les chats de l'utilisateur

**GET** `/api/chat/chats`

Récupère tous les chats de l'utilisateur connecté (médecin ou patient).

**Response (200):**
```json
{
  "success": true,
  "message": "Chats retrieved successfully",
  "chats": [
    {
      "chat_id": 1,
      "doctor_id": 1,
      "patient_id": 2,
      "last_message_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-10T08:00:00Z",
      "doctor_name": "Dr. John Smith",
      "doctor_profile": "/assets/profiles/doctor1.jpg",
      "patient_name": "Jane Doe",
      "patient_profile": "/assets/profiles/patient1.jpg",
      "unread_count": 2,
      "last_message_text": "Hello doctor!",
      "last_message_type": "text"
    }
  ]
}
```

**Note:** 
- Pour un médecin, retourne tous les chats où il est le médecin
- Pour un patient, retourne tous les chats où il est le patient
- Les chats sont triés par `last_message_at` (plus récent en premier)

### 5. Marquer les messages comme lus

**PUT** `/api/chat/messages/:chatId/read`

Marque tous les messages non lus d'un chat comme lus.

**Response (200):**
```json
{
  "success": true,
  "message": "Messages marked as read",
  "updated_count": 3
}
```

## Stockage des Fichiers

Les fichiers uploadés sont stockés dans le dossier `assets/chat_files/` avec un nom unique généré automatiquement.

**Format du nom de fichier:** `chat-file-{random-hex}.{extension}`

**URL d'accès:** `/assets/chat_files/{filename}`

## Sécurité

1. **Authentification:** Tous les endpoints nécessitent un token JWT valide
2. **Autorisation:** 
   - Les utilisateurs ne peuvent accéder qu'aux chats auxquels ils participent
   - Un médecin ne peut envoyer des messages que dans ses propres chats
   - Un patient ne peut envoyer des messages que dans ses propres chats
3. **Validation des fichiers:**
   - Types de fichiers limités
   - Taille maximale: 10MB
   - Validation du type MIME

## Gestion des Erreurs

Toutes les erreurs suivent le format standard:

```json
{
  "success": false,
  "message": "Description de l'erreur",
  "error": "Détails techniques (optionnel)"
}
```

**Codes d'erreur courants:**
- `400`: Requête invalide (champs manquants, validation échouée)
- `401`: Non authentifié (token manquant ou invalide)
- `403`: Accès refusé (pas autorisé à accéder à cette ressource)
- `404`: Ressource non trouvée (chat ou message introuvable)
- `500`: Erreur serveur

## Frontend

### Pages

1. **Patient Chat** (`/patient/chat`)
   - Liste des conversations avec les médecins
   - Interface de chat en temps réel
   - Support des fichiers et images

2. **Professional Chat** (`/professional/chat`)
   - Liste des conversations avec les patients
   - Interface de chat en temps réel
   - Support des fichiers et images

### Intégration avec les Rendez-vous

Un bouton "Chat" est disponible dans les pages de détails de rendez-vous:
- **Patient:** `/patient/visits/:id`
- **Professional:** `/professional/consultations/:id`

Le bouton crée automatiquement un chat s'il n'existe pas déjà et redirige vers la page de chat.

## Améliorations Futures

- [ ] Notifications en temps réel (WebSockets)
- [ ] Indicateur de "typing" (en train d'écrire)
- [ ] Statut de lecture par message
- [ ] Recherche dans les messages
- [ ] Pièces jointes multiples
- [ ] Réactions aux messages
- [ ] Messages épinglés
















