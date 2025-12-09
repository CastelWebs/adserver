const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mysql = require("mysql");
const dotenv = require("dotenv");
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');

dotenv.config();


const app = express();
const port = process.env.PORT || 8000;


// Conexión a MySQL
const connection = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});



app.get("/", (req, res) => {
  res.send("Servidor Archivo Digital");
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "1800");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader( "Access-Control-Allow-Methods", "PUT, POST, GET, DELETE, PATCH, OPTIONS" ); 
});


/*app.use(bodyParser.json());
app.use(cors({
    origin: '208.109.202.181', // Permitir todos los orígenes
}));*/
app.use(bodyParser.json());
app.use(cors({
    origin: '*', // Permitir todos los orígenes
}));

app.use('/files', express.static(path.join(__dirname, 'files')));

// Configuración de Multer para la subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'files');
    
    // Verifica si la carpeta ./files existe, si no, la crea
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath); // Especifica la carpeta de destino
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname); 
    // Asigna un nombre único al archivo
  }
});

const upload = multer({ storage: storage });

// Ruta para subir archivos y agregar a la base de datos
app.post('/upload', upload.array('files', 10), async (req, res) => {
  const { folder_id } = req.body; // Obtenemos solo el folder_id

  // Validar si se subieron archivos
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No se recibieron archivos" });
  }

  try {
    const currentDate = new Date().toISOString(); // Obtener la fecha actual en formato ISO

    req.files.forEach(file => {
      const fileName = file.originalname; // Utilizamos el nombre original del archivo
      const src = path.join('files', fileName); // Ruta relativa al archivo subido
      
      // Insertar la información del archivo en la base de datos
      const query = 'INSERT INTO files (name, src, folder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)';
      connection.query(query, [fileName, src, folder_id, currentDate, currentDate], (err, result) => {
        if (err) {
          console.error('Error al insertar el archivo en la base de datos:', err);
        } else {
          console.log(`Archivo ${fileName} agregado a la base de datos con éxito.`);
        }
      });
    });

    // Devuelve una respuesta exitosa
    res.json({
      message: "Archivos subidos y agregados a la base de datos exitosamente",
      files: req.files
    });

  } catch (error) {
    console.error('Error en el servidor:', error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

//LOGIN

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Verificar si el usuario existe en la base de datos MySQL
        const query = 'SELECT * FROM users WHERE email = ?';
        connection.query(query, [email], async (err, results) => {
            if (err) {
                console.error("Error en la consulta:", err);
                return res.status(500).json({ error: "Error en el servidor. Inténtelo más tarde." });
            }

            // Si no se encuentra ningún usuario con ese email
            if (results.length === 0) {
                return res.status(404).json({ error: "Usuario no encontrado." });
            }

            const user = results[0];

            // Verificar la contraseña
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ error: "Contraseña incorrecta." });
            }

            // Verificar el rol del usuario
            const role = user.role; // Asegúrate de que el campo `role` esté en la tabla users
            console.log(`Servidor: ${role}`);

            // Si la autenticación es exitosa, devolver la información del usuario
            res.json({ user: { id: user.id, email: user.email, role: role } }); // Devolver solo la información necesaria
        });
    } catch (error) {
        console.error("Error en el proceso de login:", error);
        res.status(500).json({ error: "Error en el servidor. Inténtelo más tarde." });
    }
});



//REGISTRAR USUARIOS

app.post('/signup', async (req, res) => {
  try {
      const { email, password, role } = req.body;

      // Validaciones
      if (!email) {
          return res.status(400).json({ error: "El email es obligatorio" });
      }

      if (!password || password.length < 6) {
          return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      }

      // Verificar si el usuario ya existe
      const queryCheckUser = 'SELECT * FROM users WHERE email = ?';
      connection.query(queryCheckUser, [email], async (err, results) => {
          if (err) {
              console.log(err);
              return res.status(500).json({ error: "Error en el servidor" });
          }

          if (results.length > 0) {
              return res.status(400).json({ error: "El email ya está registrado" });
          }

          // Si no existe, proceder con la creación
          const hashedPassword = await bcrypt.hash(password, 10);

          // Insertar el nuevo usuario en la base de datos
          const queryInsertUser = 'INSERT INTO users (email, password, role) VALUES (?, ?, ?)';
          connection.query(queryInsertUser, [email, hashedPassword, role], (err, result) => {
              if (err) {
                  console.log(err);
                  return res.status(500).json({ error: "Error al registrar el usuario" });
              }

              res.json({ message: 'Usuario registrado exitosamente', userId: result.insertId });
          });
      });
  } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});


//OBTENER METRICAS

app.get('/metrics', async (req, res) => {
  try {
      const query = `
          SELECT users.email, files.name, files.src, metrics.created_at 
        FROM metrics
        JOIN users ON metrics.user_id = users.id
        JOIN files ON metrics.file_id = files.id
      `;

      connection.query(query, (err, results) => {
          if (err) {
              console.log(err);
              return res.status(500).json({ error: "Error en el servidor" });
          }

          if (results.length === 0) {
              return res.status(404).json({ error: "No se encontraron métricas" });
          }

          res.json({ metrics: results });
      });
  } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});

app.post('/metrics', async (req, res) => {
  const { email, file_id } = req.body;

  try {
    // Verificar si el usuario existe
    const queryUser = 'SELECT id FROM users WHERE email = ?';
    connection.query(queryUser, [email], (err, userResults) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Error en el servidor al buscar el usuario" });
      }

      if (userResults.length === 0) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }

      const userId = userResults[0].id;

      // Verificar si el archivo existe
      const queryFile = 'SELECT id FROM files WHERE id = ?';
      connection.query(queryFile, [file_id], (err, fileResults) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: "Error en el servidor al buscar el archivo" });
        }

        if (fileResults.length === 0) {
          return res.status(404).json({ error: "Archivo no encontrado" });
        }

        // Insertar nueva métrica
        const queryInsertMetrics = 'INSERT INTO metrics (user_id, file_id) VALUES (?, ?)';
        connection.query(queryInsertMetrics, [userId, file_id], (err, result) => {
          if (err) {
            console.log(err);
            return res.status(500).json({ error: "Error en el servidor al registrar la métrica" });
          }

          res.json({ message: 'Métrica registrada con éxito', metricId: result.insertId });
        });
      });
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});



//OBTENER CATEGORIAS

app.get('/categories', async (req, res) => {
  try {
      const query = 'SELECT * FROM categories';
      connection.query(query, (err, results) => {
          if (err) {
              return res.status(500).json({ error: "Error al obtener categorías" });
          }
          res.json(results);
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});

//OBTENER SUBCATEGORIAS

app.get('/subcategories/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  try {
      const query = 'SELECT * FROM subcategories WHERE category_id = ?';
      connection.query(query, [categoryId], (err, results) => {
          if (err) {
              return res.status(500).json({ error: "Error al obtener subcategorías" });
          }
          res.json(results);
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});

//OBTENER FOLDER 

app.get('/folders/:subcategoryId', async (req, res) => {
  const { subcategoryId } = req.params;
  try {
      const query = 'SELECT * FROM folders WHERE subcategory_id = ?';
      connection.query(query, [subcategoryId], (err, results) => {
          if (err) {
              return res.status(500).json({ error: "Error al obtener folders" });
          }
          res.json(results);
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});

//OBTENER FILES

app.get('/files/:folderId', async (req, res) => {
  const { folderId } = req.params;
  try {
      const query = 'SELECT * FROM files WHERE folder_id IN (SELECT id FROM folders WHERE folder_id = ?)';
      connection.query(query, [folderId], (err, results) => {
          if (err) {
              return res.status(500).json({ error: "Error al obtener archivos" });
          }
          res.json(results);
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});

//AGREGAR SUBCATEGORIAS

app.post('/subcategories', async (req, res) => {
  const { name, category_id } = req.body;

  if (!name || !category_id) {
      return res.status(400).json({ error: "El nombre y el ID de la categoría son requeridos" });
  }

  try {
      const query = 'INSERT INTO subcategories (name, category_id) VALUES (?, ?)';
      connection.query(query, [name, category_id], (err, result) => {
          if (err) {
              console.error('Error al agregar la subcategoría:', err);
              return res.status(500).json({ error: "Error al agregar la subcategoría" });
          }
          res.json({ message: "Subcategoría agregada con éxito", id: result.insertId });
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});


//AGREGAR FOLDERS

app.post('/folders', async (req, res) => {
  const { name, subcategory_id } = req.body;

  if (!name || !subcategory_id) {
      return res.status(400).json({ error: "El nombre y el ID de la subcategoría son requeridos" });
  }

  try {
      const query = 'INSERT INTO folders (name, subcategory_id) VALUES (?, ?)';
      connection.query(query, [name, subcategory_id], (err, result) => {
          if (err) {
              console.error('Error al agregar el folder:', err);
              return res.status(500).json({ error: "Error al agregar el folder" });
          }
          res.json({ message: "Folder agregado con éxito", id: result.insertId });
      });
  } catch (error) {
      console.error('Error en el servidor:', error);
      res.status(500).json({ error: "Error en el servidor" });
  }
});


//SEARCH

app.get('/find', async (req, res) => {
    const search = req.query.search || '';
    const categoryId = req.query.category || '';

    try {
        // Si se proporciona una categoría, ajusta la consulta para filtrar por categoría
        let query = `
            SELECT files.*
            FROM files
            INNER JOIN folders ON files.folder_id = folders.id
            INNER JOIN subcategories ON folders.subcategory_id = subcategories.id
            INNER JOIN categories ON subcategories.category_id = categories.id
            WHERE files.name LIKE ?`;

        const queryParams = [`%${search}%`];

        if (categoryId) {
            // Si existe categoryId, añadimos el filtro a la consulta
            query += ` AND categories.id = ?`;
            queryParams.push(categoryId);
        }

        // Ejecutamos la consulta con los parámetros correspondientes
        connection.query(query, queryParams, (err, results) => {
            if (err) {
                console.error('Error al realizar la consulta:', err);
                return res.status(500).json({ message: 'Error interno del servidor al buscar archivos.' });
            }

            // Verifica si se encontraron archivos
            if (results.length === 0) {
                return res.status(404).json({ message: 'No se encontraron archivos.' });
            }

            // Devuelve los archivos encontrados
            res.status(200).json({ files: results });
        });
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar archivos.' });
    }
});




// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});

