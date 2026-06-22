import java.awt.*;
import java.awt.geom.*;
import java.awt.image.*;
import javax.imageio.*;
import javax.imageio.stream.*;
import java.io.*;
import java.util.Iterator;

/** Genera ilustraciones JPG de personas para cada programa (offline, Java2D). */
public class Programs {
    static final int W = 900, H = 675; // 4:3

    // Paleta de marca
    static final Color BLUE  = new Color(0x2E9BD6);
    static final Color BLUEL = new Color(0x5BC8E8);
    static final Color GREEN = new Color(0x5DAE3A);
    static final Color GREENL= new Color(0x9BD45A);
    static final Color PURPLE= new Color(0x7E5BD6);
    static final Color ORANGE= new Color(0xF4A93B);
    static final Color INK   = new Color(0x24323d);
    static final Color WOOD  = new Color(0x9c6b3f);
    static final Color WOODD = new Color(0x7d5530);

    public static void main(String[] args) throws Exception {
        save("contable", contable());
        save("sistemas", sistemas());
        save("infancia", infancia());
        save("diseno",   diseno());
        System.out.println("JPGs generados");
    }

    /* ---------- Helpers ---------- */
    static BufferedImage canvas() { return new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB); }

    static Graphics2D g2(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        return g;
    }

    static void bg(Graphics2D g, Color c1, Color c2) {
        g.setPaint(new GradientPaint(0, 0, c1, W, H, c2));
        g.fillRect(0, 0, W, H);
    }

    static void floor(Graphics2D g, Color c, int y) {
        g.setColor(c);
        g.fillRect(0, y, W, H - y);
    }

    static void desk(Graphics2D g, int x, int y, int w) {
        g.setColor(WOODD); g.fillRoundRect(x + 30, y + 30, 30, H - (y + 30), 6, 6);
        g.fillRoundRect(x + w - 60, y + 30, 30, H - (y + 30), 6, 6);
        g.setColor(WOOD);  g.fillRoundRect(x, y, w, 34, 10, 10);
        g.setColor(new Color(0,0,0,25)); g.fillRoundRect(x, y + 26, w, 8, 8, 8);
    }

    static final Color SKIN1 = new Color(0xF3C19C); // claro
    static final Color SKIN2 = new Color(0xE7AB78); // medio
    static final Color SKIN3 = new Color(0xFFD2A6); // niño

    /** Cabeza + cabello + busto. style 0=largo, 1=corto. */
    static void person(Graphics2D g, int cx, int headCy, int r,
                        Color cloth, Color hair, Color skin, int style) {
        // sombra del busto
        g.setColor(new Color(0,0,0,18));
        g.fillOval(cx - (int)(1.7*r), headCy + (int)(2.3*r), (int)(3.4*r), (int)(0.7*r));
        // cabello detrás (largo)
        if (style == 0) {
            g.setColor(hair);
            g.fillRoundRect(cx - r - 8, headCy - 6, 2*r + 16, (int)(2.2*r), 40, 40);
        }
        // busto / ropa
        g.setColor(cloth);
        int tw = (int)(3.0*r), th = (int)(2.4*r);
        g.fillRoundRect(cx - tw/2, headCy + r + 4, tw, th, 70, 70);
        // cuello
        g.setColor(darken(skin, 0.92f));
        g.fillRoundRect(cx - 14, headCy + r - 10, 28, 30, 12, 12);
        // cabello (volumen)
        g.setColor(hair);
        g.fillOval(cx - r - 6, headCy - r - 10, 2*r + 12, 2*r + 12);
        // cara
        g.setColor(skin);
        g.fillOval(cx - r, headCy - r + 4, 2*r, 2*r);
        // flequillo
        g.setColor(hair);
        g.fillArc(cx - r - 2, headCy - r, 2*r + 4, (int)(1.1*r), 20, 140);
        // orejas
        g.setColor(skin);
        g.fillOval(cx - r - 6, headCy + 2, 14, 18);
        g.fillOval(cx + r - 8, headCy + 2, 14, 18);
        // ojos
        g.setColor(new Color(0x33271c));
        int ey = headCy - 2;
        g.fillOval(cx - r/3 - 4, ey, 8, 9);
        g.fillOval(cx + r/3 - 4, ey, 8, 9);
        // cejas
        g.setStroke(new BasicStroke(3, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Line2D.Float(cx - r/3 - 8, ey - 8, cx - r/3 + 4, ey - 9));
        g.draw(new Line2D.Float(cx + r/3 - 4, ey - 9, cx + r/3 + 8, ey - 8));
        // sonrisa
        g.setColor(new Color(0xB9744F));
        g.setStroke(new BasicStroke(4, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Arc2D.Float(cx - 16, headCy + r/3 - 6, 32, 22, 200, 140, Arc2D.OPEN));
    }

    static void arm(Graphics2D g, Color skin, int x1, int y1, int x2, int y2, int wdt) {
        g.setColor(skin);
        g.setStroke(new BasicStroke(wdt, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Line2D.Float(x1, y1, x2, y2));
        g.fillOval(x2 - wdt/2, y2 - wdt/2, wdt, wdt); // mano
    }

    static Color darken(Color c, float f) {
        return new Color(Math.max(0,(int)(c.getRed()*f)), Math.max(0,(int)(c.getGreen()*f)), Math.max(0,(int)(c.getBlue()*f)));
    }
    static Color alpha(Color c, int a){ return new Color(c.getRed(), c.getGreen(), c.getBlue(), a); }

    /* ---------- Escenas ---------- */
    static BufferedImage contable() {
        BufferedImage img = canvas(); Graphics2D g = g2(img);
        bg(g, new Color(0xEAF6FC), new Color(0xD4EBF8));
        floor(g, new Color(0xCAE3F2), 500);
        // cuadro de gráficas en la pared
        g.setColor(Color.WHITE); g.fillRoundRect(120, 90, 250, 175, 16, 16);
        g.setColor(new Color(0xBcd9ea)); g.setStroke(new BasicStroke(3)); g.drawRoundRect(120, 90, 250, 175, 16, 16);
        int bx = 150, by = 235;
        g.setColor(GREENL); g.fillRoundRect(bx,       by-55, 34, 55, 8, 8);
        g.setColor(GREEN);  g.fillRoundRect(bx+55,    by-95, 34, 95, 8, 8);
        g.setColor(BLUE);   g.fillRoundRect(bx+110,   by-130,34, 130,8, 8);
        g.setColor(BLUE); g.setStroke(new BasicStroke(4, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        g.draw(new Line2D.Float(bx+10, by-70, bx+72, by-110));
        g.draw(new Line2D.Float(bx+72, by-110, bx+127, by-140));
        // escritorio
        desk(g, 70, 470, 760);
        // laptop
        g.setColor(INK); g.fillRoundRect(520, 360, 210, 130, 12, 12);
        g.setColor(BLUE); g.fillRoundRect(534, 374, 182, 102, 6, 6);
        g.setColor(alpha(Color.WHITE,90)); g.fillRoundRect(544, 384, 70, 12, 4,4); g.fillRoundRect(544, 404, 120, 10, 4,4); g.fillRoundRect(544, 422, 95, 10, 4,4);
        g.setColor(darken(INK,1.2f)); g.fillRoundRect(505, 488, 240, 14, 6, 6);
        // persona
        person(g, 300, 250, 62, BLUE, new Color(0x5b3a26), SKIN1, 0);
        arm(g, SKIN1, 360, 430, 520, 470, 30);
        // monedas
        int mx=150, my=430;
        for (int i=0;i<3;i++){ g.setColor(i==0?GREENL:(i==1?GREEN:GREENL)); g.fillOval(mx, my - i*12, 70, 26);}        
        g.setColor(GREEN); g.setStroke(new BasicStroke(4)); g.drawString("", 0,0);
        g.dispose(); return img;
    }

    static BufferedImage sistemas() {
        BufferedImage img = canvas(); Graphics2D g = g2(img);
        bg(g, new Color(0xEAFAEF), new Color(0xD3F0DA));
        floor(g, new Color(0xC4E5CC), 500);
        desk(g, 60, 470, 780);
        // monitor
        g.setColor(INK); g.fillRoundRect(110, 150, 300, 210, 14, 14);
        g.setColor(new Color(0x0d1b26)); g.fillRoundRect(126, 166, 268, 178, 8, 8);
        int[][] lines = {{150,196,90,0x5BC8E8},{250,196,90,0x9BD45A},{150,226,60,0x5DAE3A},{222,226,150,0x35536b},{180,256,120,0x2E9BD6},{150,286,100,0x9BD45A},{150,316,70,0x5BC8E8}};
        g.setStroke(new BasicStroke(8, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (int[] l : lines){ g.setColor(new Color(l[3])); g.draw(new Line2D.Float(l[0], l[1], l[0]+l[2], l[1])); }
        g.setColor(INK); g.fillRect(240, 360, 40, 26); g.fillRoundRect(200, 386, 120, 14, 8, 8);
        // teclado
        g.setColor(new Color(0xE3EEF2)); g.fillRoundRect(150, 500, 230, 40, 10, 10);
        // engranaje
        gear(g, 470, 110, 50, BLUE);
        // persona (hombre)
        person(g, 610, 250, 62, GREEN, new Color(0x2b2b2b), SKIN2, 1);
        arm(g, SKIN2, 552, 430, 360, 500, 30);
        g.dispose(); return img;
    }

    static void gear(Graphics2D g, int cx, int cy, int r, Color c) {
        g.setColor(c);
        for (int i=0;i<8;i++){ double a=Math.PI*2*i/8; int tx=(int)(cx+Math.cos(a)*r); int ty=(int)(cy+Math.sin(a)*r); g.fillRoundRect(tx-9, ty-9, 18, 18, 6, 6);}        
        g.fillOval(cx-r, cy-r, 2*r, 2*r);
        g.setColor(new Color(0xEAFAEF)); g.fillOval(cx-r/2, cy-r/2, r, r);
    }

    static BufferedImage infancia() {
        BufferedImage img = canvas(); Graphics2D g = g2(img);
        bg(g, new Color(0xEAF6FC), new Color(0xE2F5E8));
        floor(g, new Color(0xD3ECDB), 510);
        // sol
        g.setColor(GREENL); g.fillOval(720, 70, 90, 90);
        g.setColor(GREEN); g.setStroke(new BasicStroke(6, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (int i=0;i<8;i++){ double a=Math.PI*2*i/8; g.draw(new Line2D.Float((float)(765+Math.cos(a)*58),(float)(115+Math.sin(a)*58),(float)(765+Math.cos(a)*72),(float)(115+Math.sin(a)*72)));}
        // educadora
        person(g, 300, 230, 64, BLUE, new Color(0x7a4a2a), SKIN1, 0);
        arm(g, SKIN1, 372, 420, 470, 470, 32);
        // niño
        person(g, 520, 330, 42, ORANGE, new Color(0x3a2a1c), SKIN3, 1);
        // bloque ABC
        g.setColor(GREEN); g.fillRoundRect(690, 470, 90, 90, 14, 14);
        g.setColor(Color.WHITE); g.setFont(new Font("SansSerif", Font.BOLD, 56));
        g.drawString("A", 712, 532);
        g.dispose(); return img;
    }

    static BufferedImage diseno() {
        BufferedImage img = canvas(); Graphics2D g = g2(img);
        bg(g, new Color(0xEEF0FC), new Color(0xE3EDFB));
        floor(g, new Color(0xDBE1F3), 510);
        // tablet de arte grande
        g.setColor(Color.WHITE); g.fillRoundRect(90, 200, 320, 320, 20, 20);
        g.setColor(new Color(0xD3DAF0)); g.setStroke(new BasicStroke(3)); g.drawRoundRect(90, 200, 320, 320, 20, 20);
        g.setColor(BLUEL); g.fillOval(130, 240, 90, 90);
        g.setColor(GREENL); g.fillRoundRect(250, 235, 110, 70, 12, 12);
        g.setColor(BLUE);  g.fillPolygon(new int[]{120,180,240}, new int[]{460,330,460}, 3);
        g.setColor(GREEN); g.fillPolygon(new int[]{250,300,350}, new int[]{460,360,460}, 3);
        // diseñadora
        person(g, 600, 250, 62, PURPLE, new Color(0x241a12), SKIN2, 0);
        arm(g, SKIN2, 540, 430, 410, 470, 30);
        // paleta de colores
        g.setColor(BLUE);   g.fillOval(470, 110, 30, 30);
        g.setColor(GREEN);  g.fillOval(520, 95, 30, 30);
        g.setColor(GREENL); g.fillOval(560, 130, 30, 30);
        g.setColor(PURPLE); g.fillOval(478, 152, 30, 30);
        g.dispose(); return img;
    }

    /* ---------- Guardar JPG con calidad ---------- */
    static void save(String name, BufferedImage img) throws IOException {
        File f = new File("web-poliandes/assets/programs/" + name + ".jpg");
        Iterator<ImageWriter> it = ImageIO.getImageWritersByFormatName("jpg");
        ImageWriter w = it.next();
        ImageWriteParam p = w.getDefaultWriteParam();
        p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        p.setCompressionQuality(0.9f);
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(f)) {
            w.setOutput(ios);
            w.write(null, new IIOImage(img, null, null), p);
        }
        w.dispose();
    }
}
