import zipfile
import xml.etree.ElementTree as ET
import sys

def read_docx(path):
    try:
        doc = zipfile.ZipFile(path)
        xml_content = doc.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        text = []
        for p in tree.findall('.//w:p', namespaces):
            para_text = ''
            for t in p.findall('.//w:t', namespaces):
                para_text += t.text if t.text else ''
            text.append(para_text)
            
        print('\n'.join(text).encode('utf-8').decode('utf-8', 'ignore'))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    read_docx(r'C:\Users\rodri\Downloads\Herramienta RI, RIP Historica y AS.docx')
